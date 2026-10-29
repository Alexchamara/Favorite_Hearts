/**
 * Another member's profile, as the server allows this viewer to see it (sections 1, 3, 4, 6, 7): photos blurred
 * until both accept, parents' names and contact details only after both accept, income labelled self-declared,
 * caste only when shared. Requests, blocks and reports act for the profile chosen in `?as=`.
 */
import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { MemberProfileView, ProfileView, RelationView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { Confirm } from '@/components/confirm';
import { AppShell, Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, errorMessage, post } from '@/lib/api';
import { refreshRelations, useMember, usePhotos } from '@/lib/queries';
import {
  childrenLabels,
  communityLabels,
  contactKindLabels,
  contactPersonLabels,
  dietLabels,
  habitLabels,
  horoscopeLabels,
  incomeLabels,
  involvementLabels,
  maritalLabels,
  platformLabels,
  relationshipLabels,
  religionLabels,
  relocationLabels,
  timelineLabels,
  valueLabels,
} from '@/features/profile/options';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { ContactList, PhotoFrame, placeOf } from './MemberCard';
import { ReportDialog } from './ReportDialog';

export default function MemberPage() {
  const { id = '' } = useParams();
  const { acting, profiles, choose, ready } = useActingProfile();
  const member = useMember(id, acting?.id ?? null, ready);
  const error = member.error instanceof ApiError ? member.error : null;
  return (
    <AppShell>
      <Link to={withAs('/browse', acting)} className="text-sm text-muted-foreground underline underline-offset-4">
        ← Browse
      </Link>
      <div className="mt-6 flex flex-col gap-6">
        {ready && <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />}
        {member.isPending ? (
          <Loading />
        ) : error?.code === 'VERIFICATION_REQUIRED' ? (
          <Notice title="Browsing opens once you are verified">
            Your identity document needs to be reviewed and your phone verified first.{' '}
            <Link to="/verify" className="text-brand underline underline-offset-4">
              Go to verification
            </Link>
          </Notice>
        ) : member.isError ? (
          <Notice tone="error">{errorMessage(member.error)}</Notice>
        ) : (
          <MemberView view={member.data} acting={acting} />
        )}
      </div>
    </AppShell>
  );
}

const label = <T extends string>(labels: Record<T, string>, value: T | null) => (value ? labels[value] : null);

function Facts({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!shown.length) return <p className="mt-2 text-sm text-muted-foreground">Nothing shared yet.</p>;
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {shown.map(([term, value]) => (
        <div key={term}>
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{term}</dt>
          <dd className="mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MemberView({ view, acting }: { view: MemberProfileView; acting: ProfileView | null }) {
  const name = view.displayName ?? 'This member';
  const blurred = view.photos.some((photo) => photo.blurred);
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {view.management === 'manager' && view.managerRelationship
            ? `Managed by a ${relationshipLabels[view.managerRelationship].toLowerCase()}`
            : 'Manages their own profile'}
        </p>
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">
          {name}
          {view.age !== null && <span className="text-muted-foreground">, {view.age}</span>}
        </h1>
        <p className="text-muted-foreground">{[view.occupation, placeOf(view)].filter(Boolean).join(' · ')}</p>
        <TrustBadges badges={view.badges} explain />
      </div>

      {view.photos.length > 0 && (
        <section aria-label="Photos">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {view.photos.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-1">
                <PhotoFrame photo={photo} name={view.displayName} className="rounded-[12px]" />
                {acting && (
                  <ReportDialog
                    reporterProfileId={acting.id}
                    profileId={view.id}
                    photoId={photo.id}
                    name={name}
                    trigger={
                      <button type="button" className="self-start text-xs text-muted-foreground underline underline-offset-4">
                        Report this photo
                      </button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {blurred && <p className="mt-2 text-sm text-muted-foreground">Photos stay blurred until you both accept.</p>}
        </section>
      )}

      <RelationPanel view={view} acting={acting} />

      <Card>
        <h2 className="font-serif text-2xl">Contact details</h2>
        {view.contacts ? (
          <ContactList contacts={view.contacts} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {view.contactsHidden === 'plan_needed'
              ? 'Your plan has ended, so contact details are hidden. They come back when you renew.'
              : view.contactsHidden === 'not_allowed'
                ? 'The candidate has not allowed you to see the contact details connections share.'
                : 'Shared only after you both accept.'}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">About</h2>
        {view.bio && <p className="mt-3 leading-relaxed whitespace-pre-line">{view.bio}</p>}
        <Facts
          items={[
            ['Height', view.heightCm ? `${view.heightCm} cm` : null],
            ['Marital status', label(maritalLabels, view.maritalStatus)],
            ['Religion', label(religionLabels, view.religion)],
            ['Education', view.education],
            ['Languages', view.languages?.join(', ')],
            ['Mother tongue', view.motherTongue],
            ['Values', view.values?.map((v) => valueLabels[v]).join(', ')],
            ['Hobbies', view.hobbies?.join(', ')],
            ['Marriage timeline', label(timelineLabels, view.timeline)],
            ['Relocation', label(relocationLabels, view.relocation)],
            ['Horoscope matching', label(horoscopeLabels, view.horoscopeImportance)],
            ['Monthly income (self-declared)', view.incomeRange === 'prefer_not_to_say' ? null : label(incomeLabels, view.incomeRange)],
          ]}
        />
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Lifestyle and community</h2>
        <Facts
          items={[
            ['Diet', label(dietLabels, view.diet)],
            ['Smoking', label(habitLabels, view.smoking)],
            ['Drinking', label(habitLabels, view.drinking)],
            ['Children', label(childrenLabels, view.childrenPlan)],
            ['Community', label(communityLabels, view.communityOpenness)],
            ['Caste or community (shared by the member)', view.caste],
          ]}
        />
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">Family</h2>
        {view.family.familyStory && <p className="mt-3 leading-relaxed whitespace-pre-line">{view.family.familyStory}</p>}
        <Facts
          items={[
            ['Mother', [view.family.motherName, view.family.motherOccupation].filter(Boolean).join(', ') || null],
            ['Father', [view.family.fatherName, view.family.fatherOccupation].filter(Boolean).join(', ') || null],
            ['Sisters', view.family.sisters?.join(', ')],
            ['Brothers', view.family.brothers?.join(', ')],
            ['Family involvement', label(involvementLabels, view.family.familyInvolvement)],
          ]}
        />
        {!view.family.namesShown && <p className="mt-3 text-sm text-muted-foreground">Parents’ names are shared once you both accept.</p>}
      </Card>
    </>
  );
}

const reasons: Record<NonNullable<RelationView['reason']>, string> = {
  no_plan: 'A plan is needed to send requests, see who is interested and accept. Buying a plan opens in a later update.',
  not_published: 'Publish your profile before sending requests.',
  not_allowed: 'The candidate has not allowed you to manage requests for this profile.',
  pending: '',
  connected: '',
  cooldown: '',
};

/** Where the acting profile stands with this member, and what it can do next. */
function RelationPanel({ view, acting }: { view: MemberProfileView; acting: ProfileView | null }) {
  const navigate = useNavigate();
  const name = view.displayName ?? 'this member';
  const relation = view.relation;
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(path, body ?? {}),
    onSuccess: refreshRelations,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const block = useMutation({
    mutationFn: () => post(`/profiles/${acting!.id}/blocks`, { profileId: view.id }),
    onSuccess: async () => {
      toast.success(`${name} is blocked. You no longer see each other.`);
      await refreshRelations();
      navigate(withAs('/browse', acting));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!acting) {
    return (
      <Notice title="Create your profile to send requests">
        Requests are sent from a published profile. <Link to="/" className="text-brand underline underline-offset-4">Go to your profiles</Link>
      </Notice>
    );
  }
  const latest = relation?.latestInterest;
  let status: ReactNode;
  if (relation?.connectionId) {
    status = (
      <>
        <p>You are connected. Contact details and photos are shared both ways.</p>
        <Confirm
          title={`End the connection with ${name}?`}
          action="End connection"
          destructive
          onConfirm={() => act.mutate({ path: `/connections/${relation.connectionId}/end` })}
          trigger={
            <Button variant="outline" className="h-11 self-start">
              End connection
            </Button>
          }
        >
          <p>From now on neither of you sees the other’s contact details or unblurred photos.</p>
          <p>A new request between you can be sent after 7 days.</p>
        </Confirm>
      </>
    );
  } else if (latest?.status === 'pending' && latest.direction === 'sent') {
    status = (
      <>
        <p>Your request is waiting for {name} to answer.</p>
        <Button variant="outline" className="h-11 self-start" disabled={act.isPending} onClick={() => act.mutate({ path: `/interests/${latest.id}/withdraw` })}>
          Withdraw the request
        </Button>
      </>
    );
  } else if (latest?.status === 'pending' && latest.direction === 'received') {
    status = (
      <>
        <p>{name} sent you a request.</p>
        <div className="flex flex-wrap gap-3">
          <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ path: `/interests/${latest.id}/accept` }, { onSuccess: () => toast.success('Accepted. You are now connected.') })}>
            Accept
          </Button>
          <Button variant="outline" className="h-11" disabled={act.isPending} onClick={() => act.mutate({ path: `/interests/${latest.id}/decline` })}>
            Decline
          </Button>
        </div>
      </>
    );
  } else if (relation?.reason === 'cooldown' && relation.cooldownUntil) {
    status = <p>You can send a new request to {name} from {new Date(relation.cooldownUntil).toLocaleDateString()}.</p>;
  } else if (relation?.canSend) {
    status = <SendRequestDialog acting={acting} receiverId={view.id} name={name} />;
  } else {
    status = <p className="text-muted-foreground">{reasons[relation?.reason ?? 'no_plan']}</p>;
  }

  return (
    <Card>
      <h2 className="font-serif text-2xl">Your request</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm">{status}</div>
      <div className="mt-6 flex flex-wrap gap-4 border-t pt-4 text-sm">
        <Confirm
          title={`Block ${name}?`}
          action="Block"
          destructive
          onConfirm={() => block.mutate()}
          trigger={
            <button type="button" className="text-muted-foreground underline underline-offset-4">
              Block
            </button>
          }
        >
          <p>You stop seeing each other anywhere on Favorite Hearts. A connection between you ends and open requests close.</p>
          <p>{name} is not told. You can unblock later from your connections.</p>
        </Confirm>
        <ReportDialog
          reporterProfileId={acting.id}
          profileId={view.id}
          name={name}
          trigger={
            <button type="button" className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4">
              <Flag className="size-3.5" aria-hidden="true" />
              Report
            </button>
          }
        />
      </div>
    </Card>
  );
}

/** Section 4: before sending, the member sees exactly what is shared if both accept. */
function SendRequestDialog({ acting, receiverId, name }: { acting: ProfileView; receiverId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const shared = acting.contacts.filter((contact) => contact.shareWithConnections);
  const photos = usePhotos(acting.id).data ?? [];
  const names = [acting.fields.motherName, acting.fields.fatherName].some(Boolean);
  const send = useMutation({
    mutationFn: () =>
      post(`/profiles/${acting.id}/interests`, { receiverProfileId: receiverId, confirmSharing: true, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      toast.success(`Request sent to ${name}.`);
      setOpen(false);
      await refreshRelations();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 self-start">Send a request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a request to {name}?</DialogTitle>
          <DialogDescription>If {name} accepts, you both see what the other shares. From your profile that is:</DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 text-sm">
          {shared.map((contact) => (
            <li key={contact.id}>
              {acting.management === 'self' ? 'Your' : `The ${contactPersonLabels[contact.person].toLowerCase()}’s`}{' '}
              {contact.kind === 'social' && contact.platform ? platformLabels[contact.platform] : contactKindLabels[contact.kind].toLowerCase()}: {contact.value}
            </li>
          ))}
          {photos.length > 0 && <li>Your photos, unblurred</li>}
          {names && <li>Your parents’ names</li>}
        </ul>
        <p className="text-sm text-muted-foreground">You can change what is shared under Contacts. If they decline, nothing is shared.</p>
        {send.isError && <Notice tone="error">{errorMessage(send.error)}</Notice>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Sending…' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
