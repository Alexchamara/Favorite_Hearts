/**
 * Step 1 of the setup wizard, "Your role" (SCREEN-028, decision B3): who the profile is for, as the demo's role cards
 * (.m-role-grid, .m-role-option). Myself makes a self-managed profile; every other card a managed one with that
 * relationship. After the matching declaration, Continue creates the profile (POST /profiles) and opens The essentials.
 * It replaces the earlier "Create a profile" dialog.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, UserRound, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DEFAULT_MANAGER_CAPACITY, MANAGER_RELATIONSHIPS, type ProfileView } from '@fh/shared';
import { CheckboxField } from '@/components/form/fields';
import { AppShell, Loading, Notice } from '@/components/layout';
import { errorMessage, post } from '@/lib/api';
import { storeProfile, useProfiles } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { Onboarding } from './Onboarding';

type Role = 'self' | (typeof MANAGER_RELATIONSHIPS)[number];
const ROLES: Role[] = ['self', ...MANAGER_RELATIONSHIPS];

export default function NewProfilePage() {
  const profiles = useProfiles();
  return <AppShell onboarding>{profiles.isPending ? <main id="main" className="m-main"><Loading /></main> : <RoleStep profiles={profiles.data ?? []} />}</AppShell>;
}

function RoleStep({ profiles }: { profiles: ProfileView[] }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [role, setRole] = useState<Role | ''>('');
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownExists = profiles.some((p) => p.me.role === 'candidate');
  const atLimit = profiles.filter((p) => p.me.role === 'manager').length >= DEFAULT_MANAGER_CAPACITY;
  const self = role === 'self';
  const create = useMutation({
    mutationFn: () =>
      post<ProfileView>('/profiles', self ? { management: 'self', adultDeclared: true } : { management: 'manager', relationship: role, authorityDeclared: true }),
    onSuccess: async (profile) => {
      await storeProfile(profile);
      navigate(`/profiles/${profile.id}/details`);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const unavailable = (option: Role) => (option === 'self' ? ownExists : atLimit);
  return (
    <Onboarding
      step="role"
      isOpen={() => false}
      onStep={() => undefined}
      kicker={t('onboard.role.kicker')}
      title={t('create.who.title')}
      lead={t('create.who.body')}
      error={error}
      back={() => navigate('/')}
      busy={create.isPending}
      next={() => {
        if (role === '') return setError(t('onboard.role.choose'));
        if (!declared) return setError(t('onboard.role.declare'));
        setError(null);
        create.mutate();
      }}
    >
      <div className="m-role-grid" role="group" aria-label={t('create.who.label')}>
        {ROLES.map((option) => {
          const off = unavailable(option);
          const chosen = role === option;
          return (
            <button
              key={option}
              type="button"
              className={`m-role-option ${chosen ? 'selected' : ''}`}
              aria-pressed={chosen}
              disabled={off}
              onClick={() => {
                setRole(option);
                setDeclared(false);
                setError(null);
              }}
            >
              <span>
                {option === 'self' ? <UserRound size={21} aria-hidden="true" /> : <Users size={21} aria-hidden="true" />}
                <i aria-hidden="true">{chosen && <Check size={14} />}</i>
              </span>
              <strong>{t(`create.role.${option}`)}</strong>
              <small>{off ? (option === 'self' ? t('create.role.self.taken') : t('dashboard.limit', { count: DEFAULT_MANAGER_CAPACITY })) : t(`create.role.${option}.hint`)}</small>
            </button>
          );
        })}
      </div>
      {role !== '' && (
        <div className="m-form-block">
          <Notice>{t(self ? 'create.self.body' : 'create.manager.body')}</Notice>
          <CheckboxField checked={declared} onChange={setDeclared} label={t(self ? 'create.self.declare' : 'create.manager.declare')} />
        </div>
      )}
    </Onboarding>
  );
}
