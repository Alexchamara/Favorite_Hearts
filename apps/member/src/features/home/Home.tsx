/**
 * Home: sign in, then the profiles this account operates (own, managed or joined as candidate),
 * creating a profile, and the account's own verification status.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { DEFAULT_MANAGER_CAPACITY, MANAGER_RELATIONSHIPS, type ProfileView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { CheckboxField, SelectField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage, post } from '@/lib/api';
import { storeProfile, useMe, useMyCases, useProfiles } from '@/lib/queries';
import { NameStep, SignIn } from '@/features/auth/SignIn';
import { caseStatusLabels, documentLabels, options, relationshipLabels, statusLabels } from '@/features/profile/options';

export default function Home() {
  const me = useMe();
  if (me.isPending) return <AppShell><Loading /></AppShell>;
  if (me.data?.staffRole) return <Navigate to="/staff" replace />;
  return (
    <AppShell>
      {!me.data ? (
        <>
          <PageTitle kicker="Your matrimony account" title="A thoughtful beginning.">
            Create or manage a matrimony profile, for yourself or for a family member. Creating and publishing a profile is
            free once you are verified.
          </PageTitle>
          <Card>
            <SignIn />
          </Card>
        </>
      ) : !me.data.name ? (
        <>
          <PageTitle kicker="Welcome" title="What should we call you?" />
          <Card>
            <NameStep />
          </Card>
        </>
      ) : (
        <Dashboard />
      )}
    </AppShell>
  );
}

function Dashboard() {
  const profiles = useProfiles();
  const cases = useMyCases();
  const me = useMe().data!;
  const [creating, setCreating] = useState<'self' | 'manager' | null>(null);
  if (profiles.isPending) return <Loading />;
  if (profiles.isError) return <Notice tone="error">{errorMessage(profiles.error)}</Notice>;

  const list = profiles.data;
  const ownProfile = list.find((p) => p.me.role === 'candidate');
  const managed = list.filter((p) => p.me.role === 'manager');
  const latestCase = cases.data?.[0];

  return (
    <>
      <PageTitle kicker={`Hello, ${me.name}`} title="Your profiles" />
      <div className="flex flex-col gap-4">
        {list.length === 0 && (
          <Notice title="No profiles yet">Start with your own profile, or one for a family member you are helping.</Notice>
        )}
        {list.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} />
        ))}
        <div className="flex flex-wrap gap-3">
          {!ownProfile && (
            <Button className="h-11" onClick={() => setCreating('self')}>
              Create my own profile
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11"
            disabled={managed.length >= DEFAULT_MANAGER_CAPACITY}
            onClick={() => setCreating('manager')}
          >
            Create a profile for a family member
          </Button>
        </div>
        {managed.length >= DEFAULT_MANAGER_CAPACITY && (
          <p className="text-sm text-muted-foreground">
            You manage {managed.length} profiles, the usual limit. Contact us if you need to manage more.
          </p>
        )}
      </div>

      <Card className="mt-10">
        <h2 className="font-serif text-2xl">Your verification</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Publishing needs your identity document reviewed and your phone verified by SMS. Documents are uploaded only here,
          never by WhatsApp or email.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Identity document</dt>
            <dd className="text-muted-foreground">
              {latestCase
                ? `${documentLabels[latestCase.documentType]}: ${caseStatusLabels[latestCase.status].toLowerCase()}`
                : 'Not submitted'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Phone</dt>
            <dd className="text-muted-foreground">
              {me.phoneNumber ? `${me.phoneNumber}${me.phoneNumberVerified ? ' (verified)' : ''}` : 'Not verified'}
            </dd>
          </div>
        </dl>
        <Button asChild variant="outline" className="mt-5 h-11">
          <Link to="/verify">Verification</Link>
        </Button>
      </Card>

      <CreateProfileDialog kind={creating} onClose={() => setCreating(null)} />
    </>
  );
}

function ProfileCard({ profile }: { profile: ProfileView }) {
  const role =
    profile.me.role === 'manager'
      ? 'You manage this profile'
      : profile.management === 'manager'
        ? `Managed by ${profile.manager?.name ?? 'a family member'} (${profile.manager ? relationshipLabels[profile.manager.relationship].toLowerCase() : ''})`
        : 'Your own profile';
  return (
    <Link
      to={`/profiles/${profile.id}`}
      className="group flex items-center justify-between gap-4 rounded-[var(--ui-panel-radius)] border bg-card p-5 shadow-[var(--ui-shadow)] hover:border-[var(--ui-accent)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-serif text-xl">{profile.fields.displayName ?? 'Untitled profile'}</p>
        <p className="text-sm text-muted-foreground">
          {role} · <span className="font-semibold text-foreground">{statusLabels[profile.status]}</span>
          {profile.status === 'draft' && profile.missing.length > 0 && ` · ${profile.missing.length} to complete`}
        </p>
        <TrustBadges badges={profile.badges} />
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}

function CreateProfileDialog({ kind, onClose }: { kind: 'self' | 'manager' | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [declared, setDeclared] = useState(false);
  const [relationship, setRelationship] = useState<(typeof MANAGER_RELATIONSHIPS)[number] | ''>('');
  const create = useMutation({
    mutationFn: () =>
      post<ProfileView>(
        '/profiles',
        kind === 'self'
          ? { management: 'self', adultDeclared: true }
          : { management: 'manager', relationship, authorityDeclared: true },
      ),
    onSuccess: async (profile) => {
      await storeProfile(profile);
      onClose();
      navigate(`/profiles/${profile.id}`);
    },
  });
  const ready = declared && (kind === 'self' || relationship !== '');
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setDeclared(false);
          setRelationship('');
          create.reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'self' ? 'Create your profile' : 'Create a profile for a family member'}</DialogTitle>
          <DialogDescription>
            {kind === 'self'
              ? 'Your profile stays private as a draft until you publish it.'
              : 'You can invite the candidate later to confirm it, manage it with you, or take it over.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
          {kind === 'manager' && (
            <SelectField
              label="You are the candidate’s"
              value={relationship}
              onChange={setRelationship}
              options={options(relationshipLabels)}
            />
          )}
          <CheckboxField
            checked={declared}
            onChange={setDeclared}
            label={
              kind === 'self'
                ? 'I am 18 or older and I am looking for marriage.'
                : 'The candidate is 18 or older, and I have their permission to create this profile and share their details after mutual acceptance.'
            }
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
