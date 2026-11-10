/**
 * Another member's profile, as the server allows this viewer to see it (sections 1, 3, 4, 6, 7): photos blurred
 * until both accept, parents' names and contact details only after both accept, income labelled self-declared,
 * caste only when shared. Requests, blocks and reports act for the profile chosen in `?as=`.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, Flag, LockKeyhole, MapPin, Phone, UserRound, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { MemberProfileView, ProfileView, RelationView } from '@fh/shared';
import { TrustBadges } from '@/components/badges';
import { Confirm } from '@/components/confirm';
import { AppShell, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, errorMessage, post } from '@/lib/api';
import { refreshRelations, useMember, usePhotos } from '@/lib/queries';
import { suggestionLabel, useLabels } from '@/features/profile/options';
import { formatDay } from '@/lib/format';
import { say, useI18n, type AppTextKey } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { ContactList, usePlaceOf } from './MemberCard';
import { ReportDialog } from './ReportDialog';
import { SaveButton } from './shortlist';

/**
 * Another member's profile (SCREEN-055/056), in the demo's detail markup: header (.m-sheet-header), the photo carousel
 * (.m-photo-carousel), tags, tabs (.m-tabs.m-profile-tabs: About, Family & values, Contact & social handles) and the
 * actions (.m-detail-actions). Opened from a list it is the demo's side sheet over that list (App.tsx keeps the list
 * behind it); opened from its address it is a page.
 */
export default function MemberPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { acting } = useActingProfile();
  return (
    <AppShell width="wide">
      <Link to={withAs('/browse', acting)} className="m-text">
        {t('memberPage.back')}
      </Link>
      <div className="m-detail-sheet m-detail-page">
        <MemberDetail id={id} Heading={PageHeading} />
      </div>
    </AppShell>
  );
}

/** The side sheet, over the list it was opened from; closing it goes back there. */
export function MemberSheet() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  return (
    <Sheet open onOpenChange={(open) => !open && navigate(-1)}>
      <SheetContent side="right" className="m-app m-detail-sheet" data-theme={theme}>
        <MemberDetail id={id} Heading={SheetHeading} />
      </SheetContent>
    </Sheet>
  );
}

type HeadingProps = { kicker: string; title: ReactNode; facts: ReactNode };
function SheetHeading({ kicker, title, facts }: HeadingProps) {
  return (
    <SheetHeader className="m-sheet-header">
      <span className="m-kicker uppercase">{kicker}</span>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription className="m-row-facts">{facts}</SheetDescription>
    </SheetHeader>
  );
}
function PageHeading({ kicker, title, facts }: HeadingProps) {
  return (
    <div className="m-sheet-header">
      <span className="m-kicker uppercase">{kicker}</span>
      <h1>{title}</h1>
      <p className="m-row-facts">{facts}</p>
    </div>
  );
}

function MemberDetail({ id, Heading }: { id: string; Heading: (props: HeadingProps) => ReactNode }) {
  const { acting, profiles, choose, ready } = useActingProfile();
  const member = useMember(id, acting?.id ?? null, ready);
  const error = member.error instanceof ApiError ? member.error : null;
  const { t } = useI18n();
  if (member.isPending) return <Heading kicker={t('memberPage.kicker')} title={t('common.loading')} facts={null} />;
  if (error?.code === 'VERIFICATION_REQUIRED' || member.isError)
    return (
      <>
        <Heading kicker={t('memberPage.kicker')} title={t('memberPage.thisMember')} facts={null} />
        <div className="m-detail-body">
          {error?.code === 'VERIFICATION_REQUIRED' ? (
            <Notice title={t('browse.notVerified.title')}>
              {t('browse.notVerified.body')}{' '}
              <Link to="/verify" className="text-brand underline underline-offset-4">
                {t('profile.goToVerification')}
              </Link>
            </Notice>
          ) : (
            <Notice tone="error">{errorMessage(member.error)}</Notice>
          )}
        </div>
      </>
    );
  return <MemberView view={member.data} acting={acting} picker={ready && profiles.length > 1 ? <ActingPicker profiles={profiles} acting={acting} onChoose={choose} /> : null} Heading={Heading} />;
}

const label = <T extends string>(labels: Record<T, string>, value: T | null) => (value ? labels[value] : null);

/** The demo's facts list (.m-profile-facts): only what the member shared. */
function Facts({ items }: { items: [string, ReactNode][] }) {
  const { t } = useI18n();
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!shown.length) return <p>{t('memberPage.nothing')}</p>;
  return (
    <dl className="m-profile-facts">
      {shown.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The demo's photo carousel: one photo at a time, with previous / next and the count. */
function PhotoCarousel({ view, name }: { view: MemberProfileView; name: string }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const photos = view.photos;
  const count = photos.length;
  const move = (next: number) => {
    setIndex(next);
    track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <section className="m-photo-carousel" aria-label={t('memberPage.photos')}>
      <div
        ref={track}
        className="m-photo-track"
        onScroll={(event) => event.currentTarget.clientWidth && setIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}
      >
        {count ? (
          photos.map((photo, i) => (
            <div className="m-photo-slide" key={photo.id}>
              <img src={photo.url} alt={t('memberPage.photoOf', { name, number: i + 1, count })} />
            </div>
          ))
        ) : (
          <div className="m-photo-slide">
            <div className="m-portrait m-photo-private">
              <LockKeyhole size={30} aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
      {photos.some((photo) => photo.blurred) && (
        <span className="m-photo-lock">
          <LockKeyhole size={14} aria-hidden="true" />
          {t('memberPage.blurred')}
        </span>
      )}
      {count > 1 && (
        <div className="m-photo-controls">
          <button type="button" aria-label={t('memberPage.prevPhoto')} disabled={index === 0} onClick={() => move(index - 1)}>
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
          <span aria-live="polite">
            {index + 1} / {count}
          </span>
          <button type="button" aria-label={t('memberPage.nextPhoto')} disabled={index >= count - 1} onClick={() => move(index + 1)}>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

function MemberView({ view, acting, picker, Heading }: { view: MemberProfileView; acting: ProfileView | null; picker: ReactNode; Heading: (props: HeadingProps) => ReactNode }) {
  const { t } = useI18n();
  const labels = useLabels();
  const placeOf = usePlaceOf();
  const [tab, setTab] = useState('about');
  const name = view.displayName ?? t('memberPage.thisMember');
  const place = placeOf(view);
  return (
    <>
      <Heading
        kicker={t('memberPage.kicker')}
        title={
          <>
            {name}
            {view.age !== null && `, ${view.age}`}
          </>
        }
        facts={
          <>
            {view.occupation && (
              <span>
                <BriefcaseBusiness size={14} aria-hidden="true" />
                {view.occupation}
              </span>
            )}
            {place && (
              <span>
                <MapPin size={14} aria-hidden="true" />
                {place}
              </span>
            )}
          </>
        }
      />
      <div className="m-detail-scroll">
        <PhotoCarousel view={view} name={name} />
        <div className="m-detail-body">
          {picker}
          <div className="m-detail-tags">
            <span className="m-tag">
              <Users size={13} aria-hidden="true" />
              {view.management === 'manager' && view.managerRelationship
                ? t('memberPage.managedBy', { relationship: labels.relationshipLabels[view.managerRelationship].toLowerCase() })
                : t('memberPage.selfManaged')}
            </span>
            <TrustBadges badges={view.badges} />
          </div>
          <Tabs value={tab} onValueChange={setTab} className="m-tabs m-profile-tabs">
            <TabsList>
              <TabsTrigger value="about">
                <UserRound size={15} aria-hidden="true" />
                {t('memberPage.tab.about')}
              </TabsTrigger>
              <TabsTrigger value="family">
                <Users size={15} aria-hidden="true" />
                {t('memberPage.tab.family')}
              </TabsTrigger>
              <TabsTrigger value="contacts">
                <Phone size={15} aria-hidden="true" />
                {t('memberPage.tab.contacts')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="about">
              <section>
                <h3>{t('memberPage.inWords', { name })}</h3>
                {view.bio && <p className="m-bio">{view.bio}</p>}
                <Facts
                  items={[
                    [t('details.education'), view.education],
                    [t('details.timeline'), label(labels.timelineLabels, view.timeline)],
                    [t('details.religion'), label(labels.religionLabels, view.religion)],
                    [t('memberPage.languages'), view.languages?.map((language) => suggestionLabel(t, 'spokenLanguage', language)).join(', ')],
                    [t('details.marital'), label(labels.maritalLabels, view.maritalStatus)],
                    [t('details.height'), view.heightCm ? t('memberPage.heightValue', { height: view.heightCm }) : null],
                    [t('details.income'), view.incomeRange === 'prefer_not_to_say' ? null : label(labels.incomeLabels, view.incomeRange)],
                    [t('details.relocation'), label(labels.relocationLabels, view.relocation)],
                    [t('details.horoscope'), label(labels.horoscopeLabels, view.horoscopeImportance)],
                  ]}
                />
              </section>
              <section>
                <h3>{t('profile.dash.beyond.title')}</h3>
                <div className="m-values">
                  {view.hobbies?.length ? view.hobbies.map((hobby) => <span key={hobby}>{hobby}</span>) : <p>{t('memberPage.noHobbies')}</p>}
                </div>
              </section>
              <section>
                <h3>{t('profile.dash.culture.title')}</h3>
                <Facts
                  items={[
                    [t('memberPage.motherTongue'), view.motherTongue],
                    [t('details.diet'), label(labels.dietLabels, view.diet)],
                    [t('details.smoking'), label(labels.habitLabels, view.smoking)],
                    [t('details.drinking'), label(labels.habitLabels, view.drinking)],
                    [t('details.children'), label(labels.childrenLabels, view.childrenPlan)],
                    [t('details.community'), label(labels.communityLabels, view.communityOpenness)],
                    [t('memberPage.casteShared'), view.caste],
                  ]}
                />
              </section>
              <button type="button" className="m-btn m-secondary m-contact-shortcut" onClick={() => setTab('contacts')}>
                {t('memberPage.viewContacts')}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </TabsContent>
            <TabsContent value="family">
              <section>
                <h3>{t('profile.dash.family.title')}</h3>
                <p className="m-bio">{view.family.familyStory || t('memberPage.nothing')}</p>
              </section>
              <section>
                <h3>{t('memberPage.valuesTitle')}</h3>
                <div className="m-values">{view.values?.length ? view.values.map((value) => <span key={value}>{labels.valueLabels[value]}</span>) : <p>{t('memberPage.nothing')}</p>}</div>
              </section>
              <section>
                <h3>{t('memberPage.parents')}</h3>
                <Facts
                  items={[
                    [t('memberPage.mother'), [view.family.motherName, view.family.motherOccupation].filter(Boolean).join(' · ') || null],
                    [t('memberPage.father'), [view.family.fatherName, view.family.fatherOccupation].filter(Boolean).join(' · ') || null],
                    [t('memberPage.sisters'), view.family.sisters?.join(', ')],
                    [t('memberPage.brothers'), view.family.brothers?.join(', ')],
                    [t('details.involvement'), label(labels.involvementLabels, view.family.familyInvolvement)],
                  ]}
                />
                {!view.family.namesShown && <p className="m-small-print">{t('memberPage.namesLater')}</p>}
              </section>
            </TabsContent>
            <TabsContent value="contacts">
              <div className="m-private-box m-contact-card">
                {view.contacts ? <CheckCircle2 size={21} aria-hidden="true" /> : <LockKeyhole size={21} aria-hidden="true" />}
                <div>
                  <h3>{t('memberPage.contacts')}</h3>
                  {view.contacts ? (
                    <ContactList contacts={view.contacts} />
                  ) : (
                    <p>
                      {t(
                        view.contactsHidden === 'plan_needed'
                          ? 'memberPage.contacts.plan'
                          : view.contactsHidden === 'not_allowed'
                            ? 'connections.hidden.candidate'
                            : 'memberPage.contacts.afterAccept',
                      )}
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <RelationPanel view={view} acting={acting} />
        </div>
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
    <>
      {/* The demo's actions: the shortlist and the request (or where it stands), then quieter safety actions. */}
      <div className="m-detail-actions">
        <SaveButton actingId={acting.id} profileId={view.id} />
        {status}
      </div>
      <div className="m-detail-safety">
        <Confirm
          title={t('relation.block.title', { name })}
          action={t('relation.block')}
          destructive
          onConfirm={() => block.mutate()}
          trigger={
            <button type="button" className="m-text m-danger">
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
            <button type="button" className="m-text">
              <Flag size={14} aria-hidden="true" />
              {t('relation.report')}
            </button>
          }
        />
      </div>
    </>
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
