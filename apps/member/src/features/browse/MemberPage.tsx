/**
 * Another member's profile, as the server allows this viewer to see it (sections 1, 3, 4, 6, 7): photos blurred
 * until both accept, parents' names and contact details only after both accept, income labelled self-declared,
 * caste only when shared. Requests, blocks and reports act for the profile chosen in `?as=`.
 */
import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BriefcaseBusiness, Flag, MapPin } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { MemberProfileView, ProfileView, RelationView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { Confirm } from '@/components/confirm';
import { AppShell, Card, kickerClass, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, errorMessage, post } from '@/lib/api';
import { refreshRelations, useMember, usePhotos } from '@/lib/queries';
import { suggestionLabel, useLabels } from '@/features/profile/options';
import { formatDay } from '@/lib/format';
import { say, useI18n, type AppTextKey } from '@/lib/i18n';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { ContactList, PhotoFrame, usePlaceOf } from './MemberCard';
import { ReportDialog } from './ReportDialog';
import { SaveButton } from './shortlist';

export default function MemberPage() {
  const { id = '' } = useParams();
  const { acting, profiles, choose, ready } = useActingProfile();
  const member = useMember(id, acting?.id ?? null, ready);
  const error = member.error instanceof ApiError ? member.error : null;
  const { t } = useI18n();
  return (
    <AppShell width="wide">
      <Link to={withAs('/browse', acting)} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {t('memberPage.back')}
      </Link>
      <div className="mt-5 flex flex-col gap-6">
        {ready && <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />}
        {member.isPending ? (
          <Loading />
        ) : error?.code === 'VERIFICATION_REQUIRED' ? (
          <Notice title={t('browse.notVerified.title')}>
            {t('browse.notVerified.body')}{' '}
            <Link to="/verify" className="text-brand underline underline-offset-4">
              {t('profile.goToVerification')}
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
  const { t } = useI18n();
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!shown.length) return <p className="mt-2 text-sm text-muted-foreground">{t('memberPage.nothing')}</p>;
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
  const { t } = useI18n();
  const labels = useLabels();
  const placeOf = usePlaceOf();
  const name = view.displayName ?? t('memberPage.thisMember');
  const blurred = view.photos.some((photo) => photo.blurred);
  const place = placeOf(view);
  return (
    <>
      <div className="flex flex-col gap-3">
        <p className={kickerClass}>
          {view.management === 'manager' && view.managerRelationship
            ? t('memberPage.managedBy', { relationship: labels.relationshipLabels[view.managerRelationship].toLowerCase() })
            : t('memberPage.selfManaged')}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-serif text-[2.25rem] leading-[1.1] sm:text-5xl">
            {name}
            {view.age !== null && <span className="text-muted-foreground">, {view.age}</span>}
          </h1>
          <SaveButton actingId={acting?.id ?? null} profileId={view.id} />
        </div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
          {view.occupation && (
            <span className="inline-flex items-center gap-1.5">
              <BriefcaseBusiness className="size-4" aria-hidden="true" />
              {view.occupation}
            </span>
          )}
          {place && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden="true" />
              {place}
            </span>
          )}
        </p>
        <TrustBadges badges={view.badges} explain />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-6">

      {view.photos.length > 0 && (
        <section aria-label={t('memberPage.photos')}>
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
                        {t('memberPage.reportPhoto')}
                      </button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {blurred && <p className="mt-2 text-sm text-muted-foreground">{t('memberPage.blurred')}</p>}
        </section>
      )}

      <Card>
        <h2 className="font-serif text-2xl">{t('details.about.title')}</h2>
        {view.bio && <p className="mt-3 leading-relaxed whitespace-pre-line">{view.bio}</p>}
        <Facts
          items={[
            [t('details.height'), view.heightCm ? t('memberPage.heightValue', { height: view.heightCm }) : null],
            [t('details.marital'), label(labels.maritalLabels, view.maritalStatus)],
            [t('details.religion'), label(labels.religionLabels, view.religion)],
            [t('details.education'), view.education],
            [t('memberPage.languages'), view.languages?.map((language) => suggestionLabel(t, 'spokenLanguage', language)).join(', ')],
            [t('memberPage.motherTongue'), view.motherTongue],
            [t('details.values'), view.values?.map((v) => labels.valueLabels[v]).join(', ')],
            [t('details.hobbies'), view.hobbies?.join(', ')],
            [t('details.timeline'), label(labels.timelineLabels, view.timeline)],
            [t('details.relocation'), label(labels.relocationLabels, view.relocation)],
            [t('details.horoscope'), label(labels.horoscopeLabels, view.horoscopeImportance)],
            [t('details.income'), view.incomeRange === 'prefer_not_to_say' ? null : label(labels.incomeLabels, view.incomeRange)],
          ]}
        />
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">{t('details.lifestyle.title')}</h2>
        <Facts
          items={[
            [t('details.diet'), label(labels.dietLabels, view.diet)],
            [t('details.smoking'), label(labels.habitLabels, view.smoking)],
            [t('details.drinking'), label(labels.habitLabels, view.drinking)],
            [t('details.children'), label(labels.childrenLabels, view.childrenPlan)],
            [t('details.community'), label(labels.communityLabels, view.communityOpenness)],
            [t('memberPage.casteShared'), view.caste],
          ]}
        />
      </Card>

      <Card>
        <h2 className="font-serif text-2xl">{t('details.family.title')}</h2>
        {view.family.familyStory && <p className="mt-3 leading-relaxed whitespace-pre-line">{view.family.familyStory}</p>}
        <Facts
          items={[
            [t('memberPage.mother'), [view.family.motherName, view.family.motherOccupation].filter(Boolean).join(', ') || null],
            [t('memberPage.father'), [view.family.fatherName, view.family.fatherOccupation].filter(Boolean).join(', ') || null],
            [t('memberPage.sisters'), view.family.sisters?.join(', ')],
            [t('memberPage.brothers'), view.family.brothers?.join(', ')],
            [t('details.involvement'), label(labels.involvementLabels, view.family.familyInvolvement)],
          ]}
        />
        {!view.family.namesShown && <p className="mt-3 text-sm text-muted-foreground">{t('memberPage.namesLater')}</p>}
      </Card>
      </div>
      <aside className="order-first flex flex-col gap-6 lg:sticky lg:top-6 lg:order-none">
      <RelationPanel view={view} acting={acting} />

        <Card>
          <h2 className="font-serif text-2xl">{t('memberPage.contacts')}</h2>
          {view.contacts ? (
            <ContactList contacts={view.contacts} />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                view.contactsHidden === 'plan_needed'
                  ? 'memberPage.contacts.plan'
                  : view.contactsHidden === 'not_allowed'
                    ? 'connections.hidden.candidate'
                    : 'memberPage.contacts.afterAccept',
              )}
            </p>
          )}
        </Card>
      </aside>
      </div>
    </>
  );
}

const reasons: Partial<Record<NonNullable<RelationView['reason']>, AppTextKey>> = {
  no_plan: 'relation.noPlan',
  not_published: 'relation.notPublished',
  not_allowed: 'relation.notAllowed',
};

/** Where the acting profile stands with this member, and what it can do next. */
function RelationPanel({ view, acting }: { view: MemberProfileView; acting: ProfileView | null }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const name = view.displayName ?? t('connections.thisMember');
  const relation = view.relation;
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(path, body ?? {}),
    onSuccess: refreshRelations,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const block = useMutation({
    mutationFn: () => post(`/profiles/${acting!.id}/blocks`, { profileId: view.id }),
    onSuccess: async () => {
      toast.success(say('relation.blocked', { name }));
      await refreshRelations();
      navigate(withAs('/browse', acting));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!acting) {
    return (
      <Notice title={t('relation.noProfile.title')}>
        {t('relation.noProfile.body')}{' '}
        <Link to="/" className="text-brand underline underline-offset-4">
          {t('errorPage.home')}
        </Link>
      </Notice>
    );
  }
  const latest = relation?.latestInterest;
  let status: ReactNode;
  if (relation?.connectionId) {
    status = (
      <>
        <p>{t('relation.connected')}</p>
        <Confirm
          title={t('connections.end.title', { name })}
          action={t('connections.end')}
          destructive
          onConfirm={() => act.mutate({ path: `/connections/${relation.connectionId}/end` })}
          trigger={
            <Button variant="outline" className="h-11 self-start">
              {t('connections.end')}
            </Button>
          }
        >
          <p>{t('connections.end.details')}</p>
          <p>{t('connections.end.cooldown')}</p>
        </Confirm>
      </>
    );
  } else if (latest?.status === 'pending' && latest.direction === 'sent') {
    status = (
      <>
        <p>{t('relation.waiting', { name })}</p>
        <Button variant="outline" className="h-11 self-start" disabled={act.isPending} onClick={() => act.mutate({ path: `/interests/${latest.id}/withdraw` })}>
          {t('relation.withdraw')}
        </Button>
      </>
    );
  } else if (latest?.status === 'pending' && latest.direction === 'received') {
    status = (
      <>
        <p>{t('relation.received', { name })}</p>
        <div className="flex flex-wrap gap-3">
          <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ path: `/interests/${latest.id}/accept` }, { onSuccess: () => toast.success(say('requests.accepted')) })}>
            {t('requests.accept')}
          </Button>
          <Button variant="outline" className="h-11" disabled={act.isPending} onClick={() => act.mutate({ path: `/interests/${latest.id}/decline` })}>
            {t('requests.decline')}
          </Button>
        </div>
      </>
    );
  } else if (relation?.reason === 'cooldown' && relation.cooldownUntil) {
    status = <p>{t('relation.cooldown', { name, date: formatDay(relation.cooldownUntil) })}</p>;
  } else if (relation?.canSend) {
    status = <SendRequestDialog acting={acting} receiverId={view.id} name={name} />;
  } else {
    const reason = reasons[relation?.reason ?? 'no_plan'];
    status = <p className="text-muted-foreground">{reason ? t(reason) : null}</p>;
  }

  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('relation.title')}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm">{status}</div>
      <div className="mt-6 flex flex-wrap gap-4 border-t pt-4 text-sm">
        <Confirm
          title={t('relation.block.title', { name })}
          action={t('relation.block')}
          destructive
          onConfirm={() => block.mutate()}
          trigger={
            <button type="button" className="text-muted-foreground underline underline-offset-4">
              {t('relation.block')}
            </button>
          }
        >
          <p>{t('relation.block.effect')}</p>
          <p>{t('relation.block.notTold', { name })}</p>
        </Confirm>
        <ReportDialog
          reporterProfileId={acting.id}
          profileId={view.id}
          name={name}
          trigger={
            <button type="button" className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4">
              <Flag className="size-3.5" aria-hidden="true" />
              {t('relation.report')}
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
  const { t } = useI18n();
  const { contactKindLabels, contactPersonLabels, platformLabels } = useLabels();
  const send = useMutation({
    mutationFn: () =>
      post(`/profiles/${acting.id}/interests`, { receiverProfileId: receiverId, confirmSharing: true, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      toast.success(say('send.sent', { name }));
      setOpen(false);
      await refreshRelations();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 self-start">{t('send.button')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('send.title', { name })}</DialogTitle>
          <DialogDescription>{t('send.body', { name })}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 text-sm">
          {shared.map((contact) => (
            <li key={contact.id}>
              {t(acting.management === 'self' ? 'send.item.own' : 'send.item.person', {
                person: contactPersonLabels[contact.person].toLowerCase(),
                kind: contact.kind === 'social' && contact.platform ? platformLabels[contact.platform] : contactKindLabels[contact.kind].toLowerCase(),
                value: contact.value,
              })}
            </li>
          ))}
          {photos.length > 0 && <li>{t('send.photos')}</li>}
          {names && <li>{t('send.names')}</li>}
        </ul>
        <p className="text-sm text-muted-foreground">{t('send.change')}</p>
        {send.isError && <Notice tone="error">{errorMessage(send.error)}</Notice>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? t('signIn.sending') : t('send.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
