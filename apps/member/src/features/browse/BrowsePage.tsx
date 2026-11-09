/**
 * Discover: published profiles (owner decision 29 Oct 2026: verified members only), in the demo's layout (owner,
 * 6 Nov 2026): the list beside a column for the profile being acted for and how connecting works. Filters live in a
 * "Your preferences" drawer and show as removable chips; the server applies them and they stay in the address, so a
 * search can be shared or reloaded. Photos arrive blurred unless the member chose to show their cover.
 */
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Heart, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import type { ProfileView } from '@fh/shared';
import { SelectField, TextField } from '@/components/form/fields';
import { AppShell, kickerClass, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ApiError, errorMessage } from '@/lib/api';
import { useDiscover } from '@/lib/queries';
import { options, useCountries, useLabels } from '@/features/profile/options';
import { useI18n } from '@/lib/i18n';
import { ActingPicker, useActingProfile, withAs } from './acting';
import { MemberCardLink } from './MemberCard';
import { SaveIcon } from './shortlist';

const FILTERS = ['gender', 'ageMin', 'ageMax', 'countryCode', 'religion', 'maritalStatus', 'heightMin', 'heightMax', 'caste'] as const;
type FilterKey = (typeof FILTERS)[number];
type Filters = Record<FilterKey, string>;

const readFilters = (params: URLSearchParams): Filters =>
  Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ''])) as Filters;

export default function BrowsePage() {
  const { acting, profiles, choose, ready } = useActingProfile();
  const [params, setParams] = useSearchParams();
  const applied = readFilters(params);
  const query = new URLSearchParams(Object.entries(applied).filter(([, value]) => value)).toString();
  const [draft, setDraft] = useState<Filters>(applied);
  const [open, setOpen] = useState(false);
  const discover = useDiscover(query);
  const set = (key: FilterKey) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const { t } = useI18n();
  const { genderLabels, maritalLabels, religionLabels } = useLabels();
  const countries = useCountries();
  const any = t('browse.any');

  const show = (next: Filters) => {
    const search = new URLSearchParams(Object.entries(next).filter(([, value]) => value.trim()));
    if (acting) search.set('as', acting.id);
    setParams(search);
  };
  function apply(event: FormEvent) {
    event.preventDefault();
    show(draft);
    setOpen(false);
  }
  function clear() {
    const empty = readFilters(new URLSearchParams());
    setDraft(empty);
    show(empty);
  }
  const remove = (keys: FilterKey[]) => {
    const next = { ...applied };
    keys.forEach((key) => (next[key] = ''));
    setDraft(next);
    show(next);
  };

  // What is applied, in words: "Woman", "Age 25–32", "Sri Lanka".
  const range = (min: string, max: string, unit = '') => (min && max ? `${min}–${max}${unit}` : min ? `${min}+${unit}` : `≤ ${max}${unit}`);
  const chips: { keys: FilterKey[]; text: string }[] = [];
  if (applied.gender) chips.push({ keys: ['gender'], text: genderLabels[applied.gender as keyof typeof genderLabels] ?? applied.gender });
  if (applied.countryCode) chips.push({ keys: ['countryCode'], text: countries.find((c) => c.code === applied.countryCode)?.name ?? applied.countryCode });
  if (applied.ageMin || applied.ageMax) chips.push({ keys: ['ageMin', 'ageMax'], text: t('browse.chip.age', { range: range(applied.ageMin, applied.ageMax) }) });
  if (applied.heightMin || applied.heightMax) chips.push({ keys: ['heightMin', 'heightMax'], text: t('browse.chip.height', { range: range(applied.heightMin, applied.heightMax, ' cm') }) });
  if (applied.religion) chips.push({ keys: ['religion'], text: religionLabels[applied.religion as keyof typeof religionLabels] ?? applied.religion });
  if (applied.maritalStatus) chips.push({ keys: ['maritalStatus'], text: maritalLabels[applied.maritalStatus as keyof typeof maritalLabels] ?? applied.maritalStatus });
  if (applied.caste) chips.push({ keys: ['caste'], text: applied.caste });

  const error = discover.error instanceof ApiError ? discover.error : null;
  const notVerified = error?.code === 'VERIFICATION_REQUIRED';
  const cards = discover.data?.pages.flatMap((page) => page.profiles) ?? [];

  return (
    <AppShell width="wide">
      <PageTitle
        kicker={t('browse.kicker')}
        title={t('browse.title')}
        action={
          <Button variant="outline" className="h-11" onClick={() => setOpen(true)} disabled={notVerified}>
            <SlidersHorizontal aria-hidden="true" />
            {t('browse.filters.open')}
            {chips.length > 0 && <span className="rounded-full bg-[var(--ui-purple)] px-1.5 text-xs text-[var(--ui-on-purple)] tabular-nums">{chips.length}</span>}
          </Button>
        }
      >
        {t('browse.intro')}
      </PageTitle>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          {!notVerified && (
          <div className="flex flex-wrap items-center gap-2 border-b pb-4 text-sm">
            {chips.length === 0 ? (
              <span className="text-muted-foreground">{t('browse.allProfiles')}</span>
            ) : (
              <>
                <span className="sr-only">{t('browse.filters.applied')}</span>
                <ul className="flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <li key={chip.keys.join()}>
                      <button
                        type="button"
                        onClick={() => remove(chip.keys)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card py-1 pr-2 pl-3 font-medium hover:border-[var(--ui-purple)]"
                        aria-label={t('browse.filters.remove', { filter: chip.text })}
                      >
                        {chip.text}
                        <X className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={clear} className="ml-auto min-h-9 font-semibold underline-offset-4 hover:underline">
                  {t('browse.clear')}
                </button>
              </>
            )}
          </div>
          )}

          {discover.isPending ? (
            <Loading />
          ) : notVerified ? (
            // Browsing needs the member's own checks first (owner decision 29 Oct 2026): say so, and where to do them.
            <section className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed bg-[var(--ui-surface)] px-5 py-14 text-center">
              <ShieldCheck className="size-7 text-[var(--ui-copper)]" aria-hidden="true" />
              <h2 className="font-serif text-2xl">{t('browse.notVerified.title')}</h2>
              <p className="max-w-[46ch] text-muted-foreground">{t('browse.notVerified.body')}</p>
              <Button asChild className="mt-2 h-11">
                <Link to="/verify">{t('browse.goVerify')}</Link>
              </Button>
            </section>
          ) : discover.isError ? (
            <Notice tone="error">{errorMessage(discover.error)}</Notice>
          ) : cards.length === 0 ? (
            <section className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed bg-[var(--ui-surface)] px-5 py-14 text-center">
              <Heart className="size-7 text-[var(--ui-copper)]" aria-hidden="true" />
              <h2 className="font-serif text-2xl">{t('browse.none')}</h2>
              {chips.length > 0 && (
                <Button variant="outline" className="mt-2 h-11" onClick={clear}>
                  {t('browse.clear')}
                </Button>
              )}
            </section>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('browse.list')}>
                {cards.map((card) => (
                  <li key={card.id} className="min-w-0">
                    <MemberCardLink
                      card={card}
                      href={withAs(`/members/${card.id}`, acting)}
                      action={<SaveIcon actingId={acting?.id ?? null} profileId={card.id} name={card.displayName ?? t('member.member')} />}
                    />
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

        <aside className="order-first flex flex-col gap-5 lg:order-none lg:sticky lg:top-6">
          {ready && acting && <ActingCard acting={acting} profiles={profiles} onChoose={choose} />}
          <HowItWorks />
        </aside>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-card p-6 sm:max-w-[440px]">
          <SheetHeader className="p-0 pr-10">
            <SheetTitle className="font-serif text-[1.75rem] leading-tight font-normal tracking-[-0.03em]">{t('browse.filters.open')}</SheetTitle>
            <SheetDescription>{t('browse.filters.body')}</SheetDescription>
          </SheetHeader>
          <form onSubmit={apply} className="mt-6 grid gap-4" aria-label={t('browse.filters')}>
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
              <TextField label={t('browse.heightFrom')} type="number" inputMode="decimal" step="0.1" min={100} max={230} value={draft.heightMin} onChange={set('heightMin')} error={error?.fields.heightMin} />
              <TextField label={t('browse.heightTo')} type="number" inputMode="decimal" step="0.1" min={100} max={230} value={draft.heightMax} onChange={set('heightMax')} error={error?.fields.heightMax} />
            </div>
            <SelectField label={t('details.religion')} value={draft.religion} onChange={set('religion')} options={options(religionLabels)} placeholder={any} />
            <SelectField label={t('details.marital')} value={draft.maritalStatus} onChange={set('maritalStatus')} options={options(maritalLabels)} placeholder={any} />
            <TextField label={t('details.caste')} hint={t('browse.caste.hint')} maxLength={80} value={draft.caste} onChange={set('caste')} />
            <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap gap-3 border-t bg-card px-6 pt-4 pb-2">
              <Button type="submit" className="h-11 flex-1">
                {t('browse.show')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  clear();
                  setOpen(false);
                }}
              >
                {t('browse.clear')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

/** The profile requests are sent from: who it is, how far along, and (for managers) which one. */
function ActingCard({ acting, profiles, onChoose }: { acting: ProfileView; profiles: ProfileView[]; onChoose: (id: string) => void }) {
  const { t } = useI18n();
  const { statusLabels } = useLabels();
  const name = acting.fields.displayName ?? t('card.untitled');
  const several = profiles.length > 1;
  return (
    // With one profile there is nothing to choose, so on a phone the list comes first and this card is left out.
    <section className={several ? 'rounded-[var(--ui-panel-radius)] border bg-card p-5' : 'hidden rounded-[var(--ui-panel-radius)] border bg-card p-5 lg:block'}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--ui-soft)] font-serif text-xl text-[var(--ui-purple)]" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{name}</p>
          <p className="text-sm text-muted-foreground">
            {statusLabels[acting.status]}
            {acting.status === 'draft' && acting.missing.length > 0 && ` · ${t('card.toComplete', { count: acting.missing.length })}`}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{t('acting.hint')}</p>
      {several && (
        <div className="mt-3">
          <ActingPicker profiles={profiles} acting={acting} onChoose={onChoose} />
        </div>
      )}
      <Link to={`/profiles/${acting.id}`} className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--ui-purple)] underline-offset-4 hover:underline">
        {t('browse.side.open')}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** The demo's "Less noise. More intention." card, saying how connecting really works here. */
function HowItWorks() {
  const { t } = useI18n();
  return (
    <section className="hidden rounded-[var(--ui-panel-radius)] border bg-card p-6 lg:block">
      <p className={kickerClass}>{t('browse.how.kicker')}</p>
      <h2 className="mt-3 font-serif text-[2rem] leading-[1.1]">
        {t('browse.how.title1')}
        <br />
        <em className="text-[var(--ui-copper)]">{t('browse.how.title2')}</em>
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('browse.how.body')}</p>
    </section>
  );
}
