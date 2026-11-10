/**
 * Interests and Connected (SCREEN-036 to 041), as the demo's one tabbed page: Received, Sent, Mutual, Shared details,
 * History (decision B5). Blocked members are on Privacy & safety. The dock's Interests opens it on Received
 * (/requests), Connected on Mutual (/connections); the tab is in the address (?tab=), and every tab acts for one
 * profile: the one in `?as=`, or the account's published one, chosen here when the account runs several.
 *
 * The rules stay on the server (sections 1, 2, 3, 4): without a plan, received requests are anonymous previews; a
 * connection shares contact details while the profile's plan is active; ending one is logged and starts the 7-day wait.
 */
import { useMutation } from '@tanstack/react-query';
import { ArrowUpRight, Check, Clock, Heart, LockKeyhole, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { HistoryItem, ProfileView } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { AppShell, Loading, Notice } from '@/components/layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage, post } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { refreshRelations, useConnections, useHistory, useReceived, useSent } from '@/lib/queries';
import { say, useI18n, type AppTextKey } from '@/lib/i18n';
import { ActingPicker, useActingProfile, withAs } from '@/features/browse/acting';
import { useLabels } from '@/features/profile/options';
import { ContactList, PersonRow } from '@/features/browse/MemberCard';

const TABS = ['received', 'sent', 'mutual', 'shared', 'history'] as const;
type Tab = (typeof TABS)[number];
/** Which dock item a tab belongs to: Interests (/requests) or Connected (/connections). */
const PAGE_OF: Record<Tab, 'requests' | 'connections'> = {
  received: 'requests',
  sent: 'requests',
  history: 'requests',
  mutual: 'connections',
  shared: 'connections',
};

export default function RelationsPage({ kind }: { kind: 'requests' | 'connections' }) {
  const { acting, profiles, choose, ready } = useActingProfile();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const asked = params.get('tab') as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) && PAGE_OF[asked] === kind ? asked : kind === 'requests' ? 'received' : 'mutual';
  const received = useReceived(acting?.id ?? '');
  const waiting = received.data ? (received.data.identified ? received.data.interests.length : received.data.previews.length) : 0;
  const choose_ = (next: string) => {
    const nextTab = next as Tab;
    const search = new URLSearchParams();
    if (acting) search.set('as', acting.id);
    if (nextTab !== 'received' && nextTab !== 'mutual') search.set('tab', nextTab);
    navigate(`/${PAGE_OF[nextTab]}?${search}`, { replace: PAGE_OF[nextTab] === kind });
  };
  return (
    <AppShell width="wide">
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">{t('requests.page.kicker')}</span>
          <h1>{t(kind === 'connections' ? 'relations.connectedTitle' : 'requests.page.title')}</h1>
          <p>{t('requests.page.intro')}</p>
        </div>
        {acting && (
          <span className="m-tag">
            <Heart size={14} aria-hidden="true" />
            {t('relations.newCount', { count: waiting })}
          </span>
        )}
      </div>
      {ready && profiles.length > 1 && (
        <div className="mb-5">
          <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />
        </div>
      )}
      {!ready ? (
        <Loading />
      ) : !acting ? (
        <Notice>
          {t('requests.page.noProfile')}{' '}
          <Link to="/" className="font-semibold text-brand underline underline-offset-4">
            {t('requests.page.toProfiles')}
          </Link>
        </Notice>
      ) : (
        <Tabs value={tab} onValueChange={choose_} className="m-tabs" key={acting.id}>
          <TabsList>
            <TabsTrigger value="received">
              {t('requests.received')} ({waiting})
            </TabsTrigger>
            <TabsTrigger value="sent">{t('requests.sent')}</TabsTrigger>
            <TabsTrigger value="mutual">{t('relations.tab.mutual')}</TabsTrigger>
            <TabsTrigger value="shared">{t('relations.tab.shared')}</TabsTrigger>
            <TabsTrigger value="history">{t('relations.tab.history')}</TabsTrigger>
          </TabsList>
          <TabsContent value="received">
            <ReceivedTab profile={acting} />
          </TabsContent>
          <TabsContent value="sent">
            <SentTab profile={acting} />
          </TabsContent>
          <TabsContent value="mutual">
            <ConnectionsTab profile={acting} shared={false} />
          </TabsContent>
          <TabsContent value="shared">
            <ConnectionsTab profile={acting} shared />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab profile={acting} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

/** The demo's empty state. */
function Empty({ title, body, action }: { title: AppTextKey; body: AppTextKey; action?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="m-empty">
      <Heart size={28} aria-hidden="true" />
      <h3>{t(title)}</h3>
      <p>{t(body)}</p>
      {action}
    </div>
  );
}

function useAct() {
  return useMutation({
    mutationFn: (path: string) => post(path),
    onSuccess: refreshRelations,
    onError: (error) => toast.error(errorMessage(error)),
  });
}

const memberLink = (profile: ProfileView, id: string) => `/members/${id}?as=${profile.id}`;

/** SCREEN-036/037: anonymous previews without a plan (the demo's .m-anonymous-grid), people with Accept and Decline with one. */
function ReceivedTab({ profile }: { profile: ProfileView }) {
  const received = useReceived(profile.id);
  const act = useAct();
  const navigate = useNavigate();
  const { t } = useI18n();
  const canAct = profile.me.canManageInterests;
  if (received.isPending) return <Loading />;
  if (received.isError) return <Notice tone="error">{errorMessage(received.error)}</Notice>;
  if (!received.data.identified)
    return (
      <section className="m-surface">
        <h2>{t('relations.anon.title')}</h2>
        <p>{t('requests.planShows.body')}</p>
        {received.data.previews.length ? (
          <div className="m-anonymous-grid">
            {received.data.previews.map((preview) => (
              <article className="m-anonymous-card" key={preview.id}>
                <div className="m-blurred-placeholder" role="img" aria-label={t('relations.anon.photo')}>
                  <UserRound size={58} aria-hidden="true" />
                </div>
                {preview.senderAge !== null && <strong>{t('relations.anon.age', { age: preview.senderAge })}</strong>}
                {preview.senderOccupation && <p>{preview.senderOccupation}</p>}
                <button type="button" className="m-btn" onClick={() => navigate(`/profiles/${profile.id}/plan`)}>
                  {t('relations.anon.unlock')}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="relations.empty.received.title" body="relations.empty.received.body" />
        )}
      </section>
    );
  return (
    <div className="m-surface">
      {!canAct && <Notice>{t('requests.cannotManage')}</Notice>}
      {received.data.interests.length ? (
        received.data.interests.map((item) => (
          <PersonRow
            key={item.id}
            card={item.sender}
            href={item.sender ? memberLink(profile, item.sender.id) : undefined}
            actions={
              canAct && (
                <>
                  <button type="button" className="m-btn m-secondary" disabled={act.isPending} onClick={() => act.mutate(`/interests/${item.id}/decline`)}>
                    {t('requests.decline')}
                  </button>
                  <button
                    type="button"
                    className="m-btn"
                    disabled={act.isPending}
                    onClick={() => act.mutate(`/interests/${item.id}/accept`, { onSuccess: () => toast.success(say('requests.accepted')) })}
                  >
                    {t('requests.accept')}
                    <Check size={15} aria-hidden="true" />
                  </button>
                </>
              )
            }
          />
        ))
      ) : (
        <Empty title="relations.empty.received.title" body="relations.empty.received.body" />
      )}
    </div>
  );
}

/** SCREEN-038: every request sent, with where it stands; a pending one can be withdrawn. */
function SentTab({ profile }: { profile: ProfileView }) {
  const sent = useSent(profile.id);
  const act = useAct();
  const { t } = useI18n();
  const { interestStatusLabels } = useLabels();
  const canAct = profile.me.canManageInterests;
  if (sent.isPending) return <Loading />;
  if (sent.isError) return <Notice tone="error">{errorMessage(sent.error)}</Notice>;
  return (
    <div className="m-surface">
      {sent.data.length ? (
        sent.data.map((item) => (
          <PersonRow
            key={item.id}
            card={item.receiver}
            href={item.receiver ? memberLink(profile, item.receiver.id) : undefined}
            actions={
              <>
                <span className="m-tag">
                  <Clock size={13} aria-hidden="true" />
                  {item.status === 'pending' ? t('relations.awaiting') : interestStatusLabels[item.status]}
                </span>
                {item.status === 'pending' && canAct && (
                  <button type="button" className="m-text" disabled={act.isPending} onClick={() => act.mutate(`/interests/${item.id}/withdraw`)}>
                    {t('requests.withdraw')}
                  </button>
                )}
              </>
            }
          >
            {item.cooldownUntil && new Date(item.cooldownUntil) > new Date() && <small>{t('requests.cooldown', { date: formatDay(item.cooldownUntil) })}</small>}
          </PersonRow>
        ))
      ) : (
        <Empty
          title="relations.empty.sent.title"
          body="relations.empty.sent.body"
          action={
            <Link className="m-btn m-secondary" to={withAs('/browse', profile)}>
              {t('relations.empty.sent.action')}
            </Link>
          }
        />
      )}
    </div>
  );
}

/** SCREEN-039 (Mutual) and 040 (Shared details): connections, their shared contacts, and ending one. */
function ConnectionsTab({ profile, shared }: { profile: ProfileView; shared: boolean }) {
  const connections = useConnections(profile.id);
  const navigate = useNavigate();
  const background = useLocation();
  const { t } = useI18n();
  const end = useMutation({
    mutationFn: (id: string) => post(`/connections/${id}/end`),
    onSuccess: async () => {
      toast.success(say('connections.ended'));
      await refreshRelations();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (connections.isPending) return <Loading />;
  if (connections.isError) return <Notice tone="error">{errorMessage(connections.error)}</Notice>;
  const list = connections.data;
  return (
    <>
      <div className="m-surface">
        {shared && (
          <>
            <h3>{t('relations.sharedTitle')}</h3>
            <p className="m-small-print">{t('relations.sharedNote')}</p>
          </>
        )}
        {list.length ? (
          list.map((item) => {
            const name = item.profile?.displayName ?? t('connections.thisMember');
            const href = item.profile ? memberLink(profile, item.profileId) : undefined;
            const open = () => href && navigate(href, { state: { background } });
            return (
              <PersonRow
                key={item.id}
                card={item.profile}
                href={href}
                actions={
                  shared ? (
                    <>
                      {href && (
                        <button type="button" className="m-btn m-secondary" onClick={open}>
                          {t('relations.viewShared')}
                        </button>
                      )}
                      <Confirm
                        title={t('connections.end.title', { name })}
                        action={t('connections.end')}
                        destructive
                        onConfirm={() => end.mutate(item.id)}
                        trigger={
                          <button type="button" className="m-text m-danger">
                            {t('connections.end')}
                          </button>
                        }
                      >
                        <p>{t('connections.end.details')}</p>
                        <p>{t('connections.end.cooldown')}</p>
                      </Confirm>
                    </>
                  ) : (
                    href && (
                      <button type="button" className="m-btn" onClick={open}>
                        {t('relations.viewContact')}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </button>
                    )
                  )
                }
              >
                <small>{t('connections.since', { date: formatDay(item.acceptedAt) })}</small>
                {shared &&
                  (item.contacts ? (
                    <ContactList contacts={item.contacts} />
                  ) : (
                    <p className="m-small-print">{t(item.contactsHidden === 'plan_needed' ? 'connections.hidden.plan' : 'connections.hidden.candidate')}</p>
                  ))}
              </PersonRow>
            );
          })
        ) : shared ? (
          <Empty title="relations.empty.shared.title" body="relations.empty.shared.body" />
        ) : (
          <Empty title="relations.empty.mutual.title" body="relations.empty.mutual.body" />
        )}
      </div>
      {!shared && (
        <div className="m-note">
          <LockKeyhole size={18} aria-hidden="true" />
          <p>{t('relations.noChat')}</p>
        </div>
      )}
    </>
  );
}

/** SCREEN-041, decision B5: requests declined or withdrawn, either way, and connections that ended. */
function HistoryTab({ profile }: { profile: ProfileView }) {
  const history = useHistory(profile.id);
  const { t } = useI18n();
  if (history.isPending) return <Loading />;
  if (history.isError) return <Notice tone="error">{errorMessage(history.error)}</Notice>;
  const labelOf = (item: HistoryItem): AppTextKey =>
    item.kind === 'connection'
      ? 'relations.history.ended'
      : item.status === 'declined'
        ? item.direction === 'sent'
          ? 'relations.history.declinedSent'
          : 'relations.history.declinedReceived'
        : item.direction === 'sent'
          ? 'relations.history.withdrawnSent'
          : 'relations.history.withdrawnReceived';
  return (
    <div className="m-surface">
      {history.data.length ? (
        history.data.map((item) => (
          <PersonRow
            key={`${item.kind}-${item.id}`}
            card={item.profile}
            href={item.profile ? memberLink(profile, item.profile.id) : undefined}
            actions={<span className="m-tag">{t(labelOf(item))}</span>}
          >
            <small>{formatDay(item.at)}</small>
          </PersonRow>
        ))
      ) : (
        <Empty title="relations.empty.history.title" body="relations.empty.history.body" />
      )}
    </div>
  );
}
