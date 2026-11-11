/**
 * An account without a name yet (an older account, or one whose holder cleared it): the account holder's name (the
 * candidate's own, or the family member's) before the dashboard. Sign-up asks for it, so new accounts skip this.
 */
import { useState, type FormEvent } from 'react';
import { TextField } from '@/components/form/fields';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { keys } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { authErrorMessage } from './password-auth';

export function NameStep() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }
  return (
    <form onSubmit={save}>
      <TextField
        label={t('name.label')}
        hint={t('name.hint')}
        autoComplete="name"
        maxLength={60}
        value={name}
        onChange={setName}
      />
      <button type="submit" className="m-btn" disabled={busy || name.trim().length < 2}>
        {busy ? t('common.saving') : t('common.continue')}
      </button>
      <p className="m-error" role="alert">
        {error}
      </p>
    </form>
  );
}
