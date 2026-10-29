/**
 * Private contacts (OWNER-DECISIONS section 4): never shown in discovery; shared with a connection
 * only after both sides accept, while the viewer's plan is active. Once the candidate has joined,
 * only they decide what is shared.
 */
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { contactSchema, type ContactInput, type ContactView, type ProfileView } from '@fh/shared';
import { SelectField, TextField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ApiError, del, errorMessage, patch, post } from '@/lib/api';
import { keys } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { options, platformLabels } from './options';

const kindLabels = { phone: 'Phone', email: 'Email', social: 'Social link' } as const;

export function ContactsPanel({ profile }: { profile: ProfileView }) {
  const managed = profile.management === 'manager';
  const sharingIsTheCandidates = profile.candidate.joined && profile.me.role !== 'candidate';
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
  const share = useMutation({
    mutationFn: (contact: ContactView) =>
      patch<ContactView>(`/profiles/${profile.id}/contacts/${contact.id}`, { shareWithConnections: !contact.shareWithConnections }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (contact: ContactView) => del(`/profiles/${profile.id}/contacts/${contact.id}`),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const groups = managed
    ? ([
        ['candidate', 'Candidate'],
        ['manager', 'Manager'],
      ] as const)
    : ([['candidate', 'Contacts']] as const);

  return (
    <div className="flex flex-col gap-6">
      <Notice>
        Contact details are never shown on the profile. After both sides accept, they are shared with that member only while
        their plan is active. {sharingIsTheCandidates && 'The candidate decides which of them are shared.'}
      </Notice>
      {groups.map(([person, title]) => {
        const contacts = profile.contacts.filter((contact) => contact.person === person);
        return (
          <Card key={person}>
            <h2 className="font-serif text-2xl">{title}</h2>
            {contacts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-4 divide-y">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        {contact.kind === 'social' && contact.platform ? platformLabels[contact.platform] : kindLabels[contact.kind]}
                      </p>
                      <p className="break-all">{contact.value}</p>
                      <p className="text-xs text-muted-foreground">
                        {contact.verified ? 'Verified' : contact.notVerifiedByCandidate ? 'Not verified by candidate' : 'Not verified'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={contact.shareWithConnections}
                          disabled={sharingIsTheCandidates || share.isPending}
                          onCheckedChange={() => share.mutate(contact)}
                          aria-label={`Share ${contact.value} with connections`}
                        />
                        Share
                      </label>
                      {profile.me.canEdit && (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${contact.value}`} disabled={remove.isPending} onClick={() => remove.mutate(contact)}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
      {profile.me.canEdit && <AddContact profile={profile} />}
    </div>
  );
}

function AddContact({ profile }: { profile: ProfileView }) {
  const [person, setPerson] = useState<ContactInput['person']>(profile.me.role === 'manager' ? 'manager' : 'candidate');
  const [kind, setKind] = useState<ContactInput['kind']>('phone');
  const [platform, setPlatform] = useState<NonNullable<ContactInput['platform']> | ''>('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: (input: ContactInput) => post<ContactView>(`/profiles/${profile.id}/contacts`, input),
    onSuccess: async () => {
      setValue('');
      setErrors({});
      toast.success('Contact added.');
      await queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
    },
    onError: (error) => setErrors(error instanceof ApiError ? { ...error.fields, _: error.code === 'VALIDATION' ? '' : error.message } : { _: errorMessage(error) }),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const input = { person, kind, value, ...(kind === 'social' && platform ? { platform } : {}) };
    const checked = contactSchema.safeParse(input);
    if (!checked.success) {
      setErrors(Object.fromEntries(checked.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message])));
      return;
    }
    add.mutate(input);
  }
  return (
    <Card>
      <h2 className="font-serif text-2xl">Add a contact</h2>
      <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
        {errors._ && (
          <div className="sm:col-span-2">
            <Notice tone="error">{errors._}</Notice>
          </div>
        )}
        {profile.management === 'manager' && (
          <SelectField
            label="Whose contact"
            value={person}
            onChange={(next) => next && setPerson(next)}
            options={[
              { value: 'candidate', label: 'The candidate’s' },
              { value: 'manager', label: 'Mine (the manager)' },
            ]}
          />
        )}
        <SelectField label="Type" value={kind} onChange={(next) => next && setKind(next)} options={options(kindLabels)} />
        {kind === 'social' && (
          <SelectField label="Platform" value={platform} onChange={setPlatform} options={options(platformLabels)} error={errors.platform} />
        )}
        <TextField
          className="sm:col-span-2"
          label={kind === 'phone' ? 'Phone number' : kind === 'email' ? 'Email address' : 'Username or link'}
          type={kind === 'email' ? 'email' : kind === 'phone' ? 'tel' : 'text'}
          placeholder={kind === 'phone' ? '+94 77 123 4567' : undefined}
          value={value}
          onChange={setValue}
          error={errors.value}
          hint={person === 'candidate' && profile.me.role === 'manager' && kind === 'phone' ? 'Shown as “not verified by candidate” until the candidate confirms it.' : undefined}
        />
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11" disabled={add.isPending || !value.trim()}>
            {add.isPending ? 'Adding…' : 'Add contact'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
