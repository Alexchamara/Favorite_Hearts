/**
 * Discover (SCREEN-033/034, 057, 058), on the demo's markup: the page heading with "Your preferences", the toolbar
 * (.m-discover-toolbar: search, the location filter, the sort), the summary line, the result heading, the cards
 * (.m-profile-grid of .m-card) and the right rail (.m-right-rail: the profile being acted for, how connecting works,
 * membership). Owner decision 29 Oct 2026: verified members only. The server applies every filter (decision B4 added
 * search, sort, location modes and the culture filters), and they stay in the address, so a search can be shared or
 * reloaded. Photos arrive blurred unless the member chose to show their cover.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Crown, Heart, MapPin, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DISCOVER_SORTS, type DiscoverSort, type ProfileView } from '@fh/shared';
import { SelectField, TextField } from '@/components/form/fields';
import { AppShell, Loading, Notice } from '@/components/layout';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import { useDiscover } from '@/lib/queries';
import { options, SRI_LANKA_DISTRICTS, suggestionLabel, useCountries, useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { DiscoverCard } from './MemberCard';
import { SaveIcon } from './shortlist';

/** Filters set in "Your preferences"; the toolbar's search, location and sort are kept beside them in the address. */
const FILTERS = [
  'gender',
  'ageMin',
  'ageMax',
  'religion',
  'maritalStatus',
  'heightMin',
  'heightMax',
  'caste',
  'motherTongue',
  'communityOpenness',
  'familyInvolvement',
  'childrenPlan',
  'diet',
  'smoking',
  'drinking',
] as const;
const TOOLBAR = ['q', 'sort', 'location', 'regions', 'countries', 'countryCode'] as const;
type FilterKey = (typeof FILTERS)[number];
type Filters = Record<FilterKey, string>;

const readFilters = (params: URLSearchParams): Filters => Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ''])) as Filters;

export default function BrowsePage() {
  const { acting, profiles, choose, ready } = useActingProfile();
  const [params, setParams] = useSearchParams();
  const applied = readFilters(params);
  const query = new URLSearchParams(
    [...FILTERS, ...TOOLBAR].flatMap((key) => (params.get(key) ? [[key, params.get(key)!] as [string, string]] : [])),
  ).toString();
  const discover = useDiscover(query);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  const { t } = useI18n();

  /** Changes some of the address's filters, keeping the rest and the profile being acted for. */
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value && value.trim()) next.set(key, value.trim());
      else next.delete(key);
    }
    if (acting) next.set('as', acting.id);
    setParams(next, { replace: true });
  };
  // Search as the member types, a moment after they stop.
  useEffect(() => {
    if ((params.get('q') ?? '') === search.trim()) return;
    const timer = setTimeout(() => update({ q: search }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const sort = (params.get('sort') as DiscoverSort | null) ?? 'newest';
  const clearAll = () => {
    setSearch('');
    update(Object.fromEntries([...FILTERS, ...TOOLBAR].map((key) => [key, null])));
  };

  const error = discover.error instanceof ApiError ? discover.error : null;
  const notVerified = error?.code === 'VERIFICATION_REQUIRED';
  const cards = discover.data?.pages.flatMap((page) => page.profiles) ?? [];
  const active = FILTERS.filter((key) => applied[key]).length + (params.get('q') ? 1 : 0) + (params.get('location') ? 1 : 0);

  return (
    <AppShell width="wide">
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">{t('browse.kicker')}</span>
          <h1>{t('browse.title')}</h1>
          <p>{t('browse.intro')}</p>
        </div>
        <div className="m-discover-heading-actions">
          <button type="button" className="m-btn m-secondary" onClick={() => setOpen(true)} disabled={notVerified}>
            <SlidersHorizontal size={17} aria-hidden="true" />
            {t('browse.filters.open')}
            {active > 0 && <span className="sr-only">{t('browse.filters.count', { count: active })}</span>}
          </button>
        </div>
      </div>

      {notVerified ? (
        // SCREEN-033: browsing needs the member's own checks first (owner decision 29 Oct 2026).
        <section className="m-surface m-access-gate">
          <span className="m-kicker uppercase">{t('browse.kicker')}</span>
          <h2>{t('browse.notVerified.title')}</h2>
          <p>{t('browse.notVerified.body')}</p>
          <Link className="m-btn" to="/verify">
            {t('browse.goVerify')}
          </Link>
        </section>
      ) : (
        <div className="m-discover-layout">
          <section aria-label={t('browse.list')}>
            <div className="m-discover-toolbar">
              <div className="m-search">
                <Search size={18} aria-hidden="true" />
                <input aria-label={t('browse.search')} placeholder={t('browse.search.placeholder')} value={search} maxLength={60} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <LocationFilter
                location={params.get('location') ?? 'everywhere'}
                regions={params.get('regions')?.split(',').filter(Boolean) ?? []}
                countries={params.get('countries')?.split(',').filter(Boolean) ?? []}
                apply={(location, chosen) =>
                  update({
                    location: location === 'everywhere' ? null : location,
                    regions: location === 'sri_lanka' ? chosen.join(',') : null,
                    countries: location === 'abroad' ? chosen.join(',') : null,
                    countryCode: null,
                  })
                }
              />
              <Select value={sort} onValueChange={(value) => update({ sort: value === 'newest' ? null : value })}>
                <SelectTrigger aria-label={t('browse.sort')} className="m-choice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="m-options">
                  {DISCOVER_SORTS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`browse.sort.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="m-discovery-summary">
              <span>{t('browse.sortedBy', { sort: t(`browse.sort.${sort}`).toLowerCase() })}</span>
              {active > 0 && (
                <button type="button" className="m-text" onClick={clearAll}>
                  {t('browse.clear')}
                </button>
              )}
            </div>
            <div className="m-result-head">
              <span>{t(applied.gender === 'woman' ? 'browse.results.woman' : applied.gender === 'man' ? 'browse.results.man' : 'browse.results.people')}</span>
              {!discover.isPending && !discover.isError && (
                <small>{discover.hasNextPage ? t('browse.results.countMore', { count: cards.length }) : t('browse.results.count', { count: cards.length })}</small>
              )}
            </div>
            {discover.isPending ? (
              <Loading />
            ) : discover.isError ? (
              <Notice tone="error">{errorMessage(discover.error)}</Notice>
            ) : cards.length === 0 ? (
              <div className="m-empty">
                <Heart size={28} aria-hidden="true" />
                <h3>{t('browse.empty.title')}</h3>
                <p>{t('browse.empty.body')}</p>
                {active > 0 && (
                  <button type="button" className="m-btn m-secondary" onClick={clearAll}>
                    {t('browse.empty.reset')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="m-profile-grid">
                  {cards.map((card) => (
                    <DiscoverCard
                      key={card.id}
                      card={card}
                      href={withAs(`/members/${card.id}`, acting)}
                      action={<SaveIcon className="m-bookmark" actingId={acting?.id ?? null} profileId={card.id} name={card.displayName ?? t('member.member')} />}
                    />
                  ))}
                </div>
                {discover.hasNextPage && (
                  <button type="button" className="m-btn m-secondary mx-auto mt-6 flex" disabled={discover.isFetchingNextPage} onClick={() => discover.fetchNextPage()}>
                    {discover.isFetchingNextPage ? t('common.loading') : t('browse.more')}
                  </button>
                )}
              </>
            )}
            <p className="m-discovery-end">{t('browse.end')}</p>
          </section>
          <aside className="m-right-rail">
            {ready && acting && <ActingCard acting={acting} profiles={profiles} onChoose={choose} />}
            <div className="m-intention-card">
              <span className="m-kicker uppercase">{t('browse.how.kicker')}</span>
              <h3>
                {t('browse.how.title1')}
                <br />
                <em>{t('browse.how.title2')}</em>
              </h3>
              <p>{t('browse.how.body')}</p>
              <button type="button" onClick={() => navigate(withAs('/connections', acting))}>
                {t('layout.dock.connections')} <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>
            {acting && (
              <div className="m-rail-links">
                <button type="button" onClick={() => navigate(`/profiles/${acting.id}/plan`)}>
                  <Crown size={18} aria-hidden="true" />
                  <span>
                    {t('browse.rail.membership')}
                    <small>{t('browse.rail.membershipHint')}</small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => navigate('/verify')}>
                  <ShieldCheck size={18} aria-hidden="true" />
                  <span>
                    {t('layout.menu.verification')}
                    <small>{t('profile.trust.title')}</small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            )}
            <p className="m-rail-caption">
              {t('browse.rail.caption1')}
              <br />
              {t('browse.rail.caption2')}
            </p>
          </aside>
        </div>
      )}

      <PreferencesDialog
        open={open}
        onOpenChange={setOpen}
        applied={applied}
        sort={sort}
        error={error}
        onSave={(next, nextSort) => {
          update({ ...next, sort: nextSort === 'newest' ? null : nextSort });
          setOpen(false);
        }}
      />
    </AppShell>
  );
}

/** SCREEN-058, the demo's location filter: everywhere, some districts of Sri Lanka, or some countries abroad. */
function LocationFilter({ location, regions, countries, apply }: { location: string; regions: string[]; countries: string[]; apply: (location: string, chosen: string[]) => void }) {
  const { t } = useI18n();
  const allCountries = useCountries().filter((country) => country.code !== 'LK');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(location);
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = location === 'sri_lanka' ? regions : location === 'abroad' ? countries : [];
  const nameOf = (value: string) => (location === 'abroad' ? (allCountries.find((country) => country.code === value)?.name ?? value) : suggestionLabel(t, 'district', value));
  const place = t(location === 'sri_lanka' ? 'browse.location.sriLanka' : location === 'abroad' ? 'browse.location.abroad' : 'browse.location.everywhere');
  const label = chosen.length === 1 ? nameOf(chosen[0]!) : chosen.length ? t('browse.location.count', { place, count: chosen.length }) : place;
  const optionsFor = mode === 'sri_lanka' ? SRI_LANKA_DISTRICTS.map((district) => ({ value: district, label: suggestionLabel(t, 'district', district) })) : allCountries.map((country) => ({ value: country.code, label: country.name }));
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setMode(location);
          setSelected(chosen);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="m-location-trigger" aria-label={t('browse.location.label', { label })}>
          <MapPin size={16} aria-hidden="true" />
          <span>{label}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="m-location-popover" align="start" collisionPadding={12} aria-label={t('browse.location.title')}>
        <h3>{t('browse.location.title')}</h3>
        <div className="m-location-modes" role="group" aria-label={t('browse.location.title')}>
          {(['everywhere', 'sri_lanka', 'abroad'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setSelected([]);
              }}
            >
              {t(value === 'sri_lanka' ? 'browse.location.sriLanka' : value === 'abroad' ? 'browse.location.abroad' : 'browse.location.everywhere')}
            </button>
          ))}
        </div>
        {mode !== 'everywhere' && (
          <>
            <p>{t(mode === 'sri_lanka' ? 'browse.location.districtsHint' : 'browse.location.countriesHint')}</p>
            <div className="m-location-options">
              {optionsFor.map((option) => (
                <label key={option.value} data-selected={selected.includes(option.value)}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={(event) => setSelected(event.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value))}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="m-location-actions">
          <button type="button" onClick={() => setSelected([])} disabled={!selected.length}>
            {t('browse.location.clear')}
          </button>
          <button
            type="button"
            className="m-btn"
            onClick={() => {
              apply(mode, selected);
              setOpen(false);
            }}
          >
            {t('browse.location.apply')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** SCREEN-057, the demo's preferences dialog: the main filters, then culture and lifestyle in folding sections, then the sort. */
function PreferencesDialog({
  open,
  onOpenChange,
  applied,
  sort,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: Filters;
  sort: DiscoverSort;
  error: ApiError | null;
  onSave: (filters: Filters, sort: DiscoverSort) => void;
}) {
  const { t } = useI18n();
  const labels = useLabels();
  const [draft, setDraft] = useState<Filters>(applied);
  const [draftSort, setDraftSort] = useState<DiscoverSort>(sort);
  useEffect(() => {
    if (open) {
      setDraft(applied);
      setDraftSort(sort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (key: FilterKey) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const none = t('browse.noPreference');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="m-kicker uppercase">{t('browse.filters.kicker')}</span>
          <DialogTitle>{t('browse.filters.open')}</DialogTitle>
          <DialogDescription>{t('browse.filters.body')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft, draftSort);
          }}
        >
          <div className="m-form-grid">
            <SelectField label={t('browse.filters.lookingFor')} value={draft.gender} onChange={set('gender')} options={options(labels.genderLabels)} placeholder={none} />
            <SelectField label={t('details.religion')} value={draft.religion} onChange={set('religion')} options={options(labels.religionLabels)} placeholder={none} />
            <TextField label={t('browse.ageFrom')} type="number" inputMode="numeric" min={18} max={100} value={draft.ageMin} onChange={set('ageMin')} error={error?.fields.ageMin} />
            <TextField label={t('browse.ageTo')} type="number" inputMode="numeric" min={18} max={100} value={draft.ageMax} onChange={set('ageMax')} error={error?.fields.ageMax} />
            <TextField label={t('browse.heightFrom')} type="number" inputMode="decimal" step="0.1" min={100} max={230} value={draft.heightMin} onChange={set('heightMin')} error={error?.fields.heightMin} />
            <TextField label={t('browse.heightTo')} type="number" inputMode="decimal" step="0.1" min={100} max={230} value={draft.heightMax} onChange={set('heightMax')} error={error?.fields.heightMax} />
          </div>
          <details className="m-filter-section">
            <summary>{t('browse.filters.culture')}</summary>
            <p className="m-small-print">{t('browse.filters.cultureHint')}</p>
            <div className="m-form-grid">
              <TextField label={t('details.motherTongue')} maxLength={80} value={draft.motherTongue} onChange={set('motherTongue')} />
              <SelectField label={t('details.community')} value={draft.communityOpenness} onChange={set('communityOpenness')} options={options(labels.communityLabels)} placeholder={none} />
              <SelectField label={t('details.involvement')} value={draft.familyInvolvement} onChange={set('familyInvolvement')} options={options(labels.involvementLabels)} placeholder={none} />
              <SelectField label={t('details.children')} value={draft.childrenPlan} onChange={set('childrenPlan')} options={options(labels.childrenLabels)} placeholder={none} />
              <TextField label={t('details.caste')} hint={t('browse.caste.hint')} maxLength={80} value={draft.caste} onChange={set('caste')} />
              <SelectField label={t('details.marital')} value={draft.maritalStatus} onChange={set('maritalStatus')} options={options(labels.maritalLabels)} placeholder={none} />
            </div>
          </details>
          <details className="m-filter-section">
            <summary>{t('browse.filters.lifestyle')}</summary>
            <div className="m-form-grid">
              <SelectField label={t('details.diet')} value={draft.diet} onChange={set('diet')} options={options(labels.dietLabels)} placeholder={none} />
              <SelectField label={t('details.smoking')} value={draft.smoking} onChange={set('smoking')} options={options(labels.habitLabels)} placeholder={none} />
              <SelectField label={t('details.drinking')} value={draft.drinking} onChange={set('drinking')} options={options(labels.habitLabels)} placeholder={none} />
            </div>
          </details>
          <div className="m-form-grid">
            <SelectField
              label={t('browse.sort')}
              value={draftSort}
              onChange={(value) => setDraftSort((value || 'newest') as DiscoverSort)}
              options={DISCOVER_SORTS.map((option) => ({ value: option, label: t(`browse.sort.${option}`) }))}
            />
          </div>
          <div className="m-actions">
            <button
              type="button"
              className="m-text"
              onClick={() => {
                setDraft(readFilters(new URLSearchParams()));
                setDraftSort('newest');
              }}
            >
              {t('browse.filters.reset')}
            </button>
            <button type="submit" className="m-btn">
              {t('browse.filters.save')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The demo's rail card for the profile being acted for: its letter, name and state, and (for managers) which one. */
function ActingCard({ acting, profiles, onChoose }: { acting: ProfileView; profiles: ProfileView[]; onChoose: (id: string) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { statusLabels } = useLabels();
  const name = acting.fields.displayName ?? t('card.untitled');
  return (
    <div className="m-context-card">
      <div className="m-rail-head">
        <span className="m-letter-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{name}</strong>
          <small>{statusLabels[acting.status]}</small>
        </div>
        <button type="button" aria-label={t('browse.side.open')} onClick={() => navigate(`/profiles/${acting.id}`)}>
          <ArrowUpRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p>{t('acting.hint')}</p>
      {profiles.length > 1 && <ActingPicker profiles={profiles} acting={acting} onChoose={onChoose} />}
    </div>
  );
}
