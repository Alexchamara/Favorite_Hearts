/**
 * Private contacts (OWNER-DECISIONS section 4): never shown in discovery; shared with a connection
 * only after both sides accept, while the viewer's plan is active. Once the candidate has joined,
 * only they decide what is shared.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { contactSchema, type ContactInput, type ContactView, type ProfileView } from '@fh/shared';
import { PhoneField, SelectField, TextField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ApiError, del, errorMessage, patch, post } from '@/lib/api';
import { keys, useMe } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { issueMessage, say, useI18n } from '@/lib/i18n';
import { options, useLabels } from './options';

export function ContactsPanel({ profile, children }: { profile: ProfileView; children?: ReactNode }) {
  const managed = profile.management === 'manager';
  const sharingIsTheCandidates = profile.candidate.joined && profile.me.role !== 'candidate';
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
  const { t } = useI18n();
  const { contactKindLabels, platformLabels } = useLabels();
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
        ['candidate', t('contacts.candidate')],
        ['manager', t('contacts.manager')],
      ] as const)
    : ([['candidate', t('contacts.contacts')]] as const);

  const hasAny = profile.contacts.length > 0;
  return (
    // One card for everything about reaching this person (owner, 6 Nov 2026): what is saved, adding more, and
    // (passed in as children) verifying the account holder's phone.
    <Card>
      <h2 className="font-serif text-2xl">{t('contacts.title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('contacts.notice')} {sharingIsTheCandidates && t('contacts.candidateDecides')}
      </p>
      {groups.map(([person, title]) => {
        const contacts = profile.contacts.filter((contact) => contact.person === person);
        return (
          <section key={person} className="mt-5" aria-label={title}>
            {managed && <h3 className="text-sm font-semibold">{title}</h3>}
            {contacts.length === 0 ? (
              managed && <p className="mt-1 text-sm text-muted-foreground">{t('contacts.none')}</p>
            ) : (
              <ul className="mt-1 divide-y rounded-[12px] border px-4">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        {contact.kind === 'social' && contact.platform ? platformLabels[contact.platform] : contactKindLabels[contact.kind]}
                      </p>
                      <p className="break-all">{contact.value}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(contact.verified ? 'contacts.verified' : contact.notVerifiedByCandidate ? 'contacts.notVerifiedByCandidate' : 'contacts.notVerified')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={contact.shareWithConnections}
                          disabled={sharingIsTheCandidates || share.isPending}
                          onCheckedChange={() => share.mutate(contact)}
                          aria-label={t('contacts.shareWith', { value: contact.value })}
                        />
                        {t('contacts.share')}
                      </label>
                      {profile.me.canEdit && (
                        <Button variant="ghost" size="icon" aria-label={t('contacts.remove', { value: contact.value })} disabled={remove.isPending} onClick={() => remove.mutate(contact)}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {!managed && !hasAny && <p className="mt-4 text-sm text-muted-foreground">{t('contacts.none')}</p>}
      {profile.me.canEdit && <UseVerifiedPhone profile={profile} />}
      {profile.me.canEdit && <AddContact profile={profile} startOpen={!hasAny} />}
      {children}
    </Card>
  );
}

/**
 * Publishing needs a phone among the contacts, which is not the same as the account's verified phone. When the profile
 * has no phone yet, offer that verified number in one tap, so nobody types it again or wonders why it is "still needed".
 */
function UseVerifiedPhone({ profile }: { profile: ProfileView }) {
  const me = useMe().data;
  const { t } = useI18n();
  const add = useMutation({
    mutationFn: () =>
      post<ContactView>(`/profiles/${profile.id}/contacts`, { person: profile.me.role === 'manager' ? 'manager' : 'candidate', kind: 'phone', value: me!.phoneNumber }),
    onSuccess: async () => {
      toast.success(say('contacts.added'));
      await queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!me?.phoneNumberVerified || !me.phoneNumber || profile.contacts.some((contact) => contact.kind === 'phone')) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--ui-accent)] bg-[color-mix(in_srgb,var(--ui-accent)_12%,var(--ui-surface))] px-4 py-3 text-sm">
      <p className="min-w-0 flex-1 basis-60">{t('contacts.useVerified.body', { phone: me.phoneNumber })}</p>
      <Button className="h-11" disabled={add.isPending} onClick={() => add.mutate()}>
        {t('contacts.useVerified.button')}
      </Button>
    </div>
  );
}

function AddContact({ profile, startOpen }: { profile: ProfileView; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [person, setPerson] = useState<ContactInput['person']>(profile.me.role === 'manager' ? 'manager' : 'candidate');
  const [kind, setKind] = useState<ContactInput['kind']>('phone');
  const [platform, setPlatform] = useState<NonNullable<ContactInput['platform']> | ''>('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { t } = useI18n();
  const { contactKindLabels, platformLabels } = useLabels();
  const add = useMutation({
    mutationFn: (input: ContactInput) => post<ContactView>(`/profiles/${profile.id}/contacts`, input),
    onSuccess: async () => {
      setValue('');
      setErrors({});
      setOpen(false);
      toast.success(say('contacts.added'));
      await queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
    },
    onError: (error) => setErrors(error instanceof ApiError ? { ...error.fields, _: error.code === 'VALIDATION' ? '' : error.message } : { _: errorMessage(error) }),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const input = { person, kind, value, ...(kind === 'social' && platform ? { platform } : {}) };
    const checked = contactSchema.safeParse(input);
    if (!checked.success) {
      setErrors(
        Object.fromEntries(
          checked.error.issues.map((issue) => [issue.path.join('.') || '_', issueMessage(issue as Parameters<typeof issueMessage>[0])]),
        ),
      );
      return;
    }
    add.mutate(input);
  }
  if (!open) {
    return (
      <Button variant="outline" className="mt-4 h-11" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {t('contacts.add.title')}
      </Button>
    );
  }
  return (
    <section aria-labelledby="add-contact" className="mt-6 border-t pt-5">
      <h3 id="add-contact" className="font-semibold">{t('contacts.add.title')}</h3>
      <form onSubmit={submit} className="mt-4 grid gap-5 sm:grid-cols-2">
        {errors._ && (
          <div className="sm:col-span-2">
            <Notice tone="error">{errors._}</Notice>
          </div>
        )}
        {profile.management === 'manager' && (
          <SelectField
            label={t('contacts.add.whose')}
            value={person}
            onChange={(next) => next && setPerson(next)}
            options={[
              { value: 'candidate', label: t('contacts.add.candidates') },
              { value: 'manager', label: t('contacts.add.mine') },
            ]}
          />
        )}
        <SelectField
          label={t('contacts.add.type')}
          value={kind}
          onChange={(next) => {
            if (!next) return;
            setKind(next);
            setValue('');
          }}
          options={options(contactKindLabels)}
        />
        {kind === 'social' && (
          <SelectField label={t('contacts.add.platform')} value={platform} onChange={setPlatform} options={options(platformLabels)} error={errors.platform} />
        )}
        {kind === 'phone' ? (
          <PhoneField
            className="sm:col-span-2"
            label={t('contacts.add.phone')}
            value={value}
            onChange={setValue}
            error={errors.value}
            hint={person === 'candidate' && profile.me.role === 'manager' ? t('contacts.add.phoneHint') : undefined}
          />
        ) : (
          <TextField
            className="sm:col-span-2"
            label={t(kind === 'email' ? 'contacts.add.email' : 'contacts.add.social')}
            type={kind === 'email' ? 'email' : 'text'}
            value={value}
            onChange={setValue}
            error={errors.value}
          />
        )}
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit" className="h-11" disabled={add.isPending || !value.trim()}>
            {add.isPending ? t('contacts.add.adding') : t('contacts.add.submit')}
          </Button>
          {profile.contacts.length > 0 && (
            <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
