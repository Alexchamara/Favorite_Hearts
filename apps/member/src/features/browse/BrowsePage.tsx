/**
 * Browse published profiles (owner decision 29 Oct 2026: verified members only). Filters are applied by the
 * server and kept in the address, so a search can be shared or reloaded. Photos arrive blurred unless the
 * member chose to show their cover.
 */
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { SelectField, TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { useDiscover } from '@/lib/queries';
import { options, useCountries, useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { MemberCardLink } from './MemberCard';

const FILTERS = ['gender', 'ageMin', 'ageMax', 'countryCode', 'religion', 'maritalStatus', 'heightMin', 'heightMax', 'caste'] as const;
type Filters = Record<(typeof FILTERS)[number], string>;

const readFilters = (params: URLSearchParams): Filters =>
  Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ''])) as Filters;

export default function BrowsePage() {
  const { acting, profiles, choose, ready } = useActingProfile();
  const [params, setParams] = useSearchParams();
  const applied = readFilters(params);
  const query = new URLSearchParams(Object.entries(applied).filter(([, value]) => value)).toString();
  const [draft, setDraft] = useState<Filters>(applied);
  const discover = useDiscover(query);
  const set = (key: keyof Filters) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const { t } = useI18n();
  const { genderLabels, maritalLabels, religionLabels } = useLabels();
  const countries = useCountries();
  const any = t('browse.any');

  function apply(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(Object.entries(draft).filter(([, value]) => value.trim()));
    if (acting) next.set('as', acting.id);
    setParams(next);
  }
  function clear() {
    const empty = readFilters(new URLSearchParams());
    setDraft(empty);
    setParams(acting ? { as: acting.id } : {});
  }

  const error = discover.error instanceof ApiError ? discover.error : null;
  const cards = discover.data?.pages.flatMap((page) => page.profiles) ?? [];

  return (
    <AppShell>
      <PageTitle kicker={t('browse.kicker')} title={t('browse.title')}>
        {t('browse.intro')}
      </PageTitle>
      <div className="flex flex-col gap-6">
        {ready && <ActingPicker profiles={profiles} acting={acting} onChoose={choose} />}
        <Card>
          <form onSubmit={apply} className="grid gap-4 sm:grid-cols-2" aria-label={t('browse.filters')}>
            <SelectField label={t('details.gender')} value={draft.gender} onChange={set('gender')} options={options(genderLabels)} placeholder={any} />
            <SelectField
              label={t('details.country')}
              value={draft.countryCode}
              onChange={set('countryCode')}
              options={countries.map((c) => ({ value: c.code, label: c.name }))}
              placeholder={any}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('browse.ageFrom')} type="number" inputMode="numeric" min={18} max={100} value={draft.ageMin} onChange={set('ageMin')} error={error?.fields.ageMin} />
              <TextField label={t('browse.ageTo')} type="number" inputMode="numeric" min={18} max={100} value={draft.ageMax} onChange={set('ageMax')} error={error?.fields.ageMax} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('browse.heightFrom')} type="number" inputMode="numeric" min={100} max={230} value={draft.heightMin} onChange={set('heightMin')} error={error?.fields.heightMin} />
              <TextField label={t('browse.heightTo')} type="number" inputMode="numeric" min={100} max={230} value={draft.heightMax} onChange={set('heightMax')} error={error?.fields.heightMax} />
            </div>
            <SelectField label={t('details.religion')} value={draft.religion} onChange={set('religion')} options={options(religionLabels)} placeholder={any} />
            <SelectField label={t('details.marital')} value={draft.maritalStatus} onChange={set('maritalStatus')} options={options(maritalLabels)} placeholder={any} />
            <TextField
              className="sm:col-span-2"
              label={t('details.caste')}
              hint={t('browse.caste.hint')}
              maxLength={80}
              value={draft.caste}
              onChange={set('caste')}
            />
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button type="submit" className="h-11">
                {t('browse.show')}
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={clear}>
                {t('browse.clear')}
              </Button>
            </div>
          </form>
        </Card>

        {discover.isPending ? (
          <Loading />
        ) : error?.code === 'VERIFICATION_REQUIRED' ? (
          <Notice title={t('browse.notVerified.title')}>
            {t('browse.notVerified.body')}{' '}
            <Link to="/verify" className="text-brand underline underline-offset-4">
              {t('profile.goToVerification')}
            </Link>
          </Notice>
        ) : discover.isError ? (
          <Notice tone="error">{errorMessage(discover.error)}</Notice>
        ) : cards.length === 0 ? (
          <Notice>{t('browse.none')}</Notice>
        ) : (
          <>
            <ul className="grid gap-5 sm:grid-cols-2" aria-label={t('browse.list')}>
              {cards.map((card) => (
                <li key={card.id}>
                  <MemberCardLink card={card} href={withAs(`/members/${card.id}`, acting)} />
                </li>
              ))}
            </ul>
            {discover.hasNextPage && (
              <Button variant="outline" className="h-11 self-center" disabled={discover.isFetchingNextPage} onClick={() => discover.fetchNextPage()}>
                {discover.isFetchingNextPage ? t('common.loading') : t('browse.more')}
              </Button>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
