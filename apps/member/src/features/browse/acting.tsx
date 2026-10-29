/**
 * The profile a member acts as while browsing (a manager may run several). It is kept in `?as=` so links
 * and the back button keep it; the server checks the account really operates that profile.
 */
import { useSearchParams } from 'react-router';
import type { ProfileView } from '@fh/shared';
import { SelectField } from '@/components/form/fields';
import { useProfiles } from '@/lib/queries';

export function useActingProfile() {
  const profiles = useProfiles();
  const [params, setParams] = useSearchParams();
  const usable = (profiles.data ?? []).filter((p) => p.status !== 'deleted');
  const fallback = usable.find((p) => p.status === 'published' && p.me.canManageInterests) ?? usable[0] ?? null;
  const acting = usable.find((p) => p.id === params.get('as')) ?? fallback;
  const choose = (id: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('as', id);
        return next;
      },
      { replace: true },
    );
  return { profiles: usable, acting, choose, ready: !profiles.isPending };
}

/** "Acting as …" when the account runs more than one profile. */
export function ActingPicker({ profiles, acting, onChoose }: { profiles: ProfileView[]; acting: ProfileView | null; onChoose: (id: string) => void }) {
  if (profiles.length < 2 || !acting) return null;
  return (
    <div className="max-w-sm">
      <SelectField
        label="Acting for"
        hint="Requests are sent from this profile."
        value={acting.id}
        onChange={(id) => id && onChoose(id)}
        options={profiles.map((p) => ({ value: p.id, label: p.fields.displayName ?? 'Untitled profile' }))}
      />
    </div>
  );
}

export const withAs = (path: string, acting: { id: string } | null) => (acting ? `${path}?as=${acting.id}` : path);
