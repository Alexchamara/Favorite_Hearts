/**
 * Privacy & safety (SCREEN-047), the demo's page: visibility (pause or show the published profile, section 7), what
 * stays private, blocked members, and closing the profile or the account, beside the demo's safety cards. It acts for
 * the profile in `?as=` (or the account's published one). Every action is an existing endpoint and its rules: pausing
 * and publishing, unblocking, "found a match", deleting the profile, deleting or exporting the account.
 * Not built: the demo's "Your reports" list (no endpoint lists a member's own reports) and the horoscope switch
 * (out of scope).
 */
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { ProfileView } from '@fh/shared';
import { AppShell, Loading, Notice } from '@/components/layout';
import { Switch } from '@/components/ui/switch';
import { del, errorMessage, post } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { refreshRelations, storeProfile, useBlocks } from '@/lib/queries';
import { say, useI18n } from '@/lib/i18n';
import { AccountCard } from './AccountCard';
import { ActingPicker, useActingProfile } from '@/features/browse/acting';
import { useLabels } from '@/features/profile/options';
import { DeleteProfileCard, EngagedCard } from '@/features/profile/StandingCards';

export default function PrivacyPage() {
  const { acting, profiles, choose, ready } = useActingProfile();
  const { t } = useI18n();
  return (
    <AppShell width="wide">
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">{t('privacy.kicker')}</span>
          <h1>{t('privacy.title')}</h1>
          <p>{t('privacy.lead')}</p>
        </div>
      </div>
      {ready && profiles.length > 1 && (
        <div className="mb-5">
          <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />
        </div>
      )}
      <div className="m-two-columns">
        <section className="m-surface" aria-labelledby="privacy-visibility">
          {!ready ? <Loading /> : acting ? <ProfilePrivacy profile={acting} /> : <AccountOnly />}
        </section>
        <aside className="m-stack">
          <div className="m-intention-card">
            <ShieldCheck size={26} aria-hidden="true" />
            <h3>{t('privacy.pace.title')}</h3>
            <p>{t('privacy.pace.body')}</p>
          </div>
          <div className="m-context-card">
            <h3>{t('privacy.safer.title')}</h3>
            <ul className="m-safety-list">
              {(['1', '2', '3', '4'] as const).map((n) => (
                <li key={n}>{t(`privacy.safer.${n}`)}</li>
              ))}
            </ul>
          </div>
          {acting && <ManagerCard profile={acting} />}
        </aside>
      </div>
    </AppShell>
  );
}

/** No profile yet: only the account itself can be closed. */
function AccountOnly() {
  const { t } = useI18n();
  return (
    <div className="m-profile-section">
      <h3 id="privacy-visibility">{t('privacy.close')}</h3>
      <AccountCard />
    </div>
  );
}

function ProfilePrivacy({ profile }: { profile: ProfileView }) {
  const { t } = useI18n();
  const visibility = useMutation({
    mutationFn: (show: boolean) => post<ProfileView>(`/profiles/${profile.id}/${show ? 'publish' : 'pause'}`),
    onSuccess: async (updated, show) => {
      await storeProfile(updated);
      toast.success(say(show ? 'profile.publishedToast' : 'profile.pausedToast'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const canSwitch = profile.me.canEdit && (profile.status === 'published' || profile.status === 'paused');
  return (
    <>
      <h3 id="privacy-visibility">{t('privacy.visibility')}</h3>
      {/* The demo's Toggle: pause or show the published profile (section 7). */}
      <div className="m-toggle">
        <div>
          <strong>{t('privacy.visible.title')}</strong>
          <p>{canSwitch ? t('privacy.visible.detail') : t('privacy.visible.draft')}</p>
        </div>
        <Switch
          aria-label={t('privacy.visible.title')}
          checked={profile.status === 'published'}
          disabled={!canSwitch || visibility.isPending}
          onCheckedChange={(show) => visibility.mutate(show)}
        />
      </div>
      <div className="m-note">
        <LockKeyhole size={20} aria-hidden="true" />
        <p>{t('privacy.note.private')}</p>
      </div>
      <div className="m-note">
        <LockKeyhole size={20} aria-hidden="true" />
        <p>{t('privacy.note.never')}</p>
      </div>
      <BlockedMembers profile={profile} />
      <div className="m-profile-section">
        <h3>{t('privacy.close')}</h3>
        <div className="m-close-panels">
          <EngagedCard profile={profile} />
          <DeleteProfileCard profile={profile} />
          <AccountCard />
        </div>
      </div>
    </>
  );
}

/** The demo's blocked list (.m-blocked-list of .m-blocked-person), with Unblock. */
function BlockedMembers({ profile }: { profile: ProfileView }) {
  const blocks = useBlocks(profile.id);
  const { t } = useI18n();
  const unblock = useMutation({
    mutationFn: (id: string) => del(`/profiles/${profile.id}/blocks/${id}`),
    onSuccess: async () => {
      toast.success(say('connections.unblocked'));
      await refreshRelations();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="m-profile-section">
      <h3>{t('privacy.blocked')}</h3>
      {blocks.isPending ? (
        <Loading />
      ) : blocks.isError ? (
        <Notice tone="error">{errorMessage(blocks.error)}</Notice>
      ) : blocks.data.length ? (
        <div className="m-blocked-list">
          {blocks.data.map((item) => {
            const name = item.displayName ?? t('blocks.aMember');
            return (
              <article className="m-blocked-person" key={item.id}>
                <div className="m-blocked-cover">
                  <span aria-hidden="true">{name.slice(0, 1)}</span>
                </div>
                <div>
                  <strong>{name}</strong>
                  <p>{t('blocks.since', { date: formatDay(item.blockedAt) })}</p>
                </div>
                <button type="button" className="m-btn m-secondary" disabled={unblock.isPending} onClick={() => unblock.mutate(item.id)}>
                  {t('blocks.unblock')}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <p>{t('privacy.noBlocked')}</p>
      )}
    </div>
  );
}

/** Who manages the profile, said plainly (the demo's "Manager transparency"). */
function ManagerCard({ profile }: { profile: ProfileView }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { relationshipLabels } = useLabels();
  const managed = profile.management === 'manager' && profile.manager;
  return (
    <div className="m-context-card">
      <h3>{t('privacy.manager.title')}</h3>
      <p>
        {managed
          ? t('card.managedBy', { name: profile.manager!.name, relationship: relationshipLabels[profile.manager!.relationship]!.toLowerCase() })
          : t('privacy.manager.self')}
      </p>
      <button type="button" className="m-text" onClick={() => navigate(`/profiles/${profile.id}`)}>
        {t('privacy.manager.open')}
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
