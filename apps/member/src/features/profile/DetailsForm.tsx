/**
 * The profile editor in four steps (spec 5.2: essentials, story, family, lifestyle). Each step
 * saves on its own, sending only what changed with the version it was based on (spec A05).
 * While a new profile is being set up, each step's button is "Save and continue": it saves, then takes the member to
 * the next step, and the last one on to Photos (SetupSteps.tsx).
 */
import { useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PROFILE_VALUES, profileFieldsSchema, type ProfileFields, type ProfileView } from '@fh/shared';
import { CheckboxField, ChipPicker, ListField, SelectField, TextAreaField, TextField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage, patch } from '@/lib/api';
import { keys, storeProfile } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { issueMessage, say, useI18n } from '@/lib/i18n';
import { options, SPOKEN_LANGUAGES, SRI_LANKA_DISTRICTS, suggestionLabel, useCountries, useLabels } from './options';

type Key = Exclude<keyof ProfileFields, 'caste' | 'adultDeclaredAt'>;
type FormValue = string | string[];
/**
 * Where "Save and continue" goes: this step's id (to be scrolled to) and what to do after saving. In the setup wizard
 * (`register`), the parts have no buttons of their own: each registers its save, and the wizard's Continue runs them.
 */
export type Save = (after: () => void) => void;
type Flow = { id: string; onContinue?: () => void; last?: boolean; register?: (save: Save) => void; heading?: boolean; intro?: boolean; bare?: boolean };

const REQUIRED = new Set<Key>(['displayName', 'gender', 'birthDate', 'countryCode', 'city', 'occupation', 'education', 'heightCm', 'maritalStatus', 'bio']);

const toForm = (value: unknown): FormValue => (Array.isArray(value) ? value : value === null || value === undefined ? '' : String(value));
function fromForm(key: Key, value: FormValue): unknown {
  if (Array.isArray(value)) return value;
  const text = value.trim();
  if (!text) return null;
  return key === 'heightCm' ? Number(text) : text;
}
const same = (a: FormValue, b: FormValue) => JSON.stringify(a) === JSON.stringify(b);

function useStep(profile: ProfileView, fields: Key[]) {
  const initial = Object.fromEntries(fields.map((key) => [key, toForm(profile.fields[key])])) as Record<Key, FormValue>;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    // The newest version: in the wizard one part saves right after another, before this one has re-rendered.
    mutationFn: (payload: Record<string, unknown>) =>
      patch<ProfileView>(`/profiles/${profile.id}`, { version: queryClient.getQueryData<ProfileView>(keys.profile(profile.id))?.version ?? profile.version, ...payload }),
    onSuccess: async (updated) => {
      toast.success(say('common.saved'));
      await storeProfile(updated);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        if (error.code === 'VERSION_CONFLICT') void queryClient.invalidateQueries({ queryKey: keys.profile(profile.id) });
      }
    },
  });
  const set = <K extends Key>(key: K) => (value: FormValue) => setValues((current) => ({ ...current, [key]: value }));
  const text = (key: Key) => values[key] as string;
  const list = (key: Key) => values[key] as string[];

  /**
   * Validates the changed fields like the server will, then saves them; `after` runs once saved (or if nothing changed).
   * `complete` (the wizard's Continue): every required field of the part must be filled, changed or not, since the next
   * step opens only once they are; empty ones are marked and the first gets focus.
   */
  function submit(extra: Record<string, unknown> = {}, after?: () => void, complete = false) {
    const payload: Record<string, unknown> = { ...extra };
    const found: Record<string, string> = {};
    for (const key of fields) {
      const value = fromForm(key, values[key]);
      if (value === null && REQUIRED.has(key) && (complete || !same(values[key], initial[key]))) {
        found[key] = say('validation.required');
        continue;
      }
      if (same(values[key], initial[key])) continue;
      payload[key] = value;
    }
    const checked = profileFieldsSchema.safeParse(payload);
    if (!checked.success) {
      for (const issue of checked.error.issues) found[issue.path.join('.')] ??= issueMessage(issue as Parameters<typeof issueMessage>[0]);
    }
    setErrors(found);
    if (Object.keys(found).length) {
      // Bring the first problem into view (it may be far down the step).
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.m-form-block [aria-invalid="true"], form [aria-invalid="true"]')?.focus());
      return;
    }
    if (!Object.keys(payload).length) return after ? after() : toast(say('details.nothingChanged'));
    save.mutate(payload, { onSuccess: () => after?.() });
  }
  return { values, set, text, list, errors, submit, saving: save.isPending, failed: save.error };
}

function Step({ title, intro, children, onSave, saving, failed, canEdit, flow }: { title: string; intro?: string; children: ReactNode; onSave: () => void; saving: boolean; failed: unknown; canEdit: boolean; flow: Flow }) {
  const { t } = useI18n();
  if (flow.register) {
    // In the wizard: the demo's form block, a heading per part, its fields in .m-form-grid; the wizard saves it.
    return (
      <section className="m-form-block" aria-labelledby={flow.heading ? flow.id : 'onboard-title'}>
        {flow.heading && <h3 id={flow.id}>{title}</h3>}
        {flow.intro && intro && <p className="m-small-print">{intro}</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <fieldset disabled={!canEdit || saving} className="m-form-grid">
            {children}
          </fieldset>
          {failed instanceof ApiError && failed.code !== 'VALIDATION' && <Notice tone="error">{errorMessage(failed)}</Notice>}
        </form>
      </section>
    );
  }
  const label = !flow.onContinue ? t('common.save') : flow.last ? t('details.saveContinuePhotos') : t('details.saveContinue');
  if (flow.bare) {
    // In a dialog (the demo's culture and lifestyle dialog, SCREEN-059): the dialog has the title; the fields and Save.
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={!canEdit || saving} className="m-form-grid">
          {children}
        </fieldset>
        {failed instanceof ApiError && failed.code !== 'VALIDATION' && <Notice tone="error">{errorMessage(failed)}</Notice>}
        {canEdit && (
          <button type="submit" className="m-btn mt-5" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        )}
      </form>
    );
  }
  return (
    <Card className="scroll-mt-6">
      <h2 id={flow.id} tabIndex={-1} className="font-serif text-2xl outline-none">
        {title}
      </h2>
      {intro && <p className="mt-2 text-sm text-muted-foreground">{intro}</p>}
      <form
        className="mt-5 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={!canEdit || saving} className="grid gap-5 sm:grid-cols-2">
          {children}
        </fieldset>
        {failed instanceof ApiError && failed.code !== 'VALIDATION' && <Notice tone="error">{errorMessage(failed)}</Notice>}
        {canEdit && (
          <div>
            <Button type="submit" className="h-11" disabled={saving}>
              {saving ? t('common.saving') : label}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

const full = 'sm:col-span-2';

function Essentials({ profile, flow }: { profile: ProfileView; flow: Flow }) {
  const f = useStep(profile, ['displayName', 'gender', 'birthDate', 'countryCode', 'region', 'city', 'occupation', 'education', 'heightCm', 'maritalStatus', 'religion', 'languages', 'motherTongue']);
  const inSriLanka = f.text('countryCode') === 'LK';
  flow.register?.((after) => f.submit({}, after, true));
  const { t } = useI18n();
  const { genderLabels, maritalLabels, religionLabels } = useLabels();
  const countries = useCountries();
  return (
    <Step title={t('details.essentials.title')} intro={t('details.essentials.intro')} onSave={() => f.submit({}, flow.onContinue)} flow={flow} saving={f.saving} failed={f.failed} canEdit={profile.me.canEdit}>
      <TextField label={t('details.name')} maxLength={60} value={f.text('displayName')} onChange={f.set('displayName')} error={f.errors.displayName} />
      <SelectField label={t('details.gender')} value={f.text('gender')} onChange={f.set('gender')} options={options(genderLabels)} error={f.errors.gender} />
      <TextField label={t('details.birthDate')} type="date" value={f.text('birthDate')} onChange={f.set('birthDate')} error={f.errors.birthDate} hint={t('details.birthDate.hint')} />
      <SelectField label={t('details.marital')} value={f.text('maritalStatus')} onChange={f.set('maritalStatus')} options={options(maritalLabels)} error={f.errors.maritalStatus} />
      <SelectField
        label={t('details.country')}
        value={f.text('countryCode')}
        onChange={(value) => {
          f.set('countryCode')(value);
          f.set('region')('');
        }}
        options={countries.map((country) => ({ value: country.code, label: country.name }))}
        error={f.errors.countryCode}
      />
      {inSriLanka ? (
        <SelectField
          label={t('details.district')}
          value={f.text('region')}
          onChange={f.set('region')}
          options={SRI_LANKA_DISTRICTS.map((district) => ({ value: district, label: suggestionLabel(t, 'district', district) }))}
          error={f.errors.region}
        />
      ) : (
        <TextField label={t('details.region')} maxLength={80} value={f.text('region')} onChange={f.set('region')} error={f.errors.region} />
      )}
      <TextField label={t('details.city')} maxLength={80} value={f.text('city')} onChange={f.set('city')} error={f.errors.city} />
      <TextField label={t('details.height')} type="number" inputMode="decimal" step="0.1" min={100} max={230} value={f.text('heightCm')} onChange={f.set('heightCm')} error={f.errors.heightCm} />
      <TextField label={t('details.occupation')} maxLength={100} value={f.text('occupation')} onChange={f.set('occupation')} error={f.errors.occupation} />
      <TextField label={t('details.education')} maxLength={200} value={f.text('education')} onChange={f.set('education')} error={f.errors.education} />
      <SelectField label={t('details.religion')} value={f.text('religion')} onChange={f.set('religion')} options={options(religionLabels)} error={f.errors.religion} />
      <TextField label={t('details.motherTongue')} maxLength={80} value={f.text('motherTongue')} onChange={f.set('motherTongue')} error={f.errors.motherTongue} />
      <div className={full}>
        <ChipPicker
          label={t('details.languages')}
          max={10}
          value={f.list('languages')}
          onChange={f.set('languages')}
          options={SPOKEN_LANGUAGES.map((language) => ({ value: language, label: suggestionLabel(t, 'spokenLanguage', language) }))}
          error={f.errors.languages}
        />
      </div>
    </Step>
  );
}

function About({ profile, flow }: { profile: ProfileView; flow: Flow }) {
  const f = useStep(profile, ['bio', 'values', 'hobbies', 'timeline', 'relocation', 'horoscopeImportance', 'incomeRange']);
  flow.register?.((after) => f.submit({}, after, true));
  const { t } = useI18n();
  const { horoscopeLabels, incomeLabels, relocationLabels, timelineLabels, valueLabels } = useLabels();
  return (
    <Step
      title={t('details.about.title')}
      intro={t('details.about.intro')}
      onSave={() => f.submit({}, flow.onContinue)} flow={flow}
      saving={f.saving}
      failed={f.failed}
      canEdit={profile.me.canEdit}
    >
      <TextAreaField className={full} label={t('details.bio')} maxLength={600} value={f.text('bio')} onChange={f.set('bio')} error={f.errors.bio} />
      <div className={full}>
        <ChipPicker label={t('details.values')} max={5} value={f.list('values')} onChange={f.set('values')} options={PROFILE_VALUES.map((value) => ({ value, label: valueLabels[value] }))} error={f.errors.values} />
      </div>
      <div className={full}>
        <ListField label={t('details.hobbies')} max={6} maxLength={50} placeholder={t('details.hobbies.placeholder')} value={f.list('hobbies')} onChange={f.set('hobbies')} error={f.errors.hobbies} />
      </div>
      <SelectField label={t('details.timeline')} value={f.text('timeline')} onChange={f.set('timeline')} options={options(timelineLabels)} error={f.errors.timeline} />
      <SelectField label={t('details.relocation')} value={f.text('relocation')} onChange={f.set('relocation')} options={options(relocationLabels)} error={f.errors.relocation} />
      <SelectField label={t('details.horoscope')} value={f.text('horoscopeImportance')} onChange={f.set('horoscopeImportance')} options={options(horoscopeLabels)} error={f.errors.horoscopeImportance} />
      <SelectField
        label={t('details.income')}
        hint={t('details.income.hint')}
        value={f.text('incomeRange')}
        onChange={f.set('incomeRange')}
        options={options(incomeLabels)}
        error={f.errors.incomeRange}
      />
    </Step>
  );
}

function Family({ profile, flow }: { profile: ProfileView; flow: Flow }) {
  const f = useStep(profile, ['familyStory', 'motherName', 'motherOccupation', 'fatherName', 'fatherOccupation', 'sisters', 'brothers', 'familyInvolvement']);
  flow.register?.((after) => f.submit({}, after, true));
  const { t } = useI18n();
  const { involvementLabels } = useLabels();
  return (
    <Step title={t('details.family.title')} intro={t('details.family.intro')} onSave={() => f.submit({}, flow.onContinue)} flow={flow} saving={f.saving} failed={f.failed} canEdit={profile.me.canEdit}>
      <TextAreaField className={full} label={t('details.familyStory')} maxLength={600} value={f.text('familyStory')} onChange={f.set('familyStory')} error={f.errors.familyStory} />
      <TextField label={t('details.motherName')} maxLength={80} value={f.text('motherName')} onChange={f.set('motherName')} error={f.errors.motherName} />
      <TextField label={t('details.motherOccupation')} maxLength={100} value={f.text('motherOccupation')} onChange={f.set('motherOccupation')} error={f.errors.motherOccupation} />
      <TextField label={t('details.fatherName')} maxLength={80} value={f.text('fatherName')} onChange={f.set('fatherName')} error={f.errors.fatherName} />
      <TextField label={t('details.fatherOccupation')} maxLength={100} value={f.text('fatherOccupation')} onChange={f.set('fatherOccupation')} error={f.errors.fatherOccupation} />
      <ListField label={t('details.sisters')} max={12} maxLength={100} placeholder={t('details.sisters.placeholder')} value={f.list('sisters')} onChange={f.set('sisters')} error={f.errors.sisters} />
      <ListField label={t('details.brothers')} max={12} maxLength={100} placeholder={t('details.brothers.placeholder')} value={f.list('brothers')} onChange={f.set('brothers')} error={f.errors.brothers} />
      <SelectField label={t('details.involvement')} value={f.text('familyInvolvement')} onChange={f.set('familyInvolvement')} options={options(involvementLabels)} error={f.errors.familyInvolvement} />
    </Step>
  );
}

function Lifestyle({ profile, flow }: { profile: ProfileView; flow: Flow }) {
  const f = useStep(profile, ['diet', 'smoking', 'drinking', 'childrenPlan', 'communityOpenness']);
  const savedCaste = profile.fields.caste?.value ?? '';
  // Section 6: "prefer not to say" is an explicit choice, and the default.
  const [share, setShare] = useState<'prefer_not' | 'share'>(savedCaste ? 'share' : 'prefer_not');
  const [caste, setCaste] = useState(savedCaste);
  const [consent, setConsent] = useState(Boolean(savedCaste));
  const wanted = share === 'share' ? caste.trim() : '';
  const casteChanged = wanted !== savedCaste;
  flow.register?.((after) => f.submit(casteChanged ? { caste: wanted ? { value: wanted, consent } : null } : {}, after, true));
  const { t } = useI18n();
  const { childrenLabels, communityLabels, dietLabels, habitLabels } = useLabels();
  const notShared = t('details.notShared');
  return (
    <Step
      title={t('details.lifestyle.title')}
      intro={t('details.lifestyle.intro')}
      onSave={() => f.submit(casteChanged ? { caste: wanted ? { value: wanted, consent } : null } : {}, flow.onContinue)}
      flow={flow}
      saving={f.saving}
      failed={f.failed}
      canEdit={profile.me.canEdit}
    >
      <SelectField label={t('details.diet')} value={f.text('diet')} onChange={f.set('diet')} options={options(dietLabels)} placeholder={notShared} />
      <SelectField label={t('details.children')} value={f.text('childrenPlan')} onChange={f.set('childrenPlan')} options={options(childrenLabels)} placeholder={notShared} />
      <SelectField label={t('details.smoking')} value={f.text('smoking')} onChange={f.set('smoking')} options={options(habitLabels)} placeholder={notShared} />
      <SelectField label={t('details.drinking')} value={f.text('drinking')} onChange={f.set('drinking')} options={options(habitLabels)} placeholder={notShared} />
      <SelectField className={full} label={t('details.community')} value={f.text('communityOpenness')} onChange={f.set('communityOpenness')} options={options(communityLabels)} placeholder={notShared} />
      <fieldset className={`${full} flex flex-col gap-3 rounded-[12px] border border-dashed p-4`}>
        <legend className="px-1 text-[13px] font-semibold">{t('details.caste')}</legend>
        {(
          [
            ['prefer_not', t('details.caste.preferNot')],
            ['share', t('details.caste.share')],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="flex items-center gap-3 text-sm">
            <input
              type="radio"
              name={`caste-choice-${profile.id}`}
              checked={share === value}
              onChange={() => setShare(value)}
              className="size-4 accent-[var(--ui-purple)]"
            />
            {text}
          </label>
        ))}
        {share === 'share' && (
          <>
            <TextField
              label={t('details.caste.label')}
              hint={t('details.caste.hint')}
              maxLength={80}
              value={caste}
              onChange={setCaste}
              error={f.errors.caste ?? f.errors['caste.value']}
            />
            <CheckboxField
              checked={consent}
              onChange={setConsent}
              error={f.errors['caste.consent']}
              label={t('details.caste.consent')}
            />
          </>
        )}
      </fieldset>
    </Step>
  );
}

const STEP_IDS = ['details-essentials', 'details-about', 'details-family', 'details-lifestyle'] as const;

/** Brings the next step into view and moves focus to its heading, so keyboard and screen-reader users follow too. */
function showStep(id: string) {
  const heading = document.getElementById(id);
  heading?.closest('section')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  heading?.focus({ preventScroll: true });
}

/** The details form in the setup wizard: The essentials, or Your story (about, family, lifestyle). */
export type DetailsPart = 'essentials' | 'story' | 'lifestyle';

/**
 * `onDone` (while setting up outside the wizard) makes each step "Save and continue", the last one going on with
 * `onDone`. `part` and `saves` put the form in the wizard: only that part's sections, no buttons, and `saves.current`
 * set to a function that saves them one after another and then calls `after` (stopping at the first problem).
 */
export function DetailsForm({ profile, onDone, part, saves, onSaved }: { profile: ProfileView; onDone?: () => void; part?: DetailsPart; saves?: { current: Save | null }; onSaved?: () => void }) {
  const { t } = useI18n();
  // One save per part, by its id: a part registers again on every render of its own (each keystroke), and the newest
  // registration replaces the older one, so Continue saves each part once, with its current values. (A plain list grew
  // with every keystroke and replayed stale saves one after another, which could meet the version check, 409.)
  const parts = useRef(new Map<string, Save>()).current;
  if (saves) saves.current = (after) => [...parts.values()].reverse().reduce<() => void>((then, save) => () => save(then), after)();
  const flow = (index: number): Flow =>
    part === 'lifestyle'
      ? { id: STEP_IDS[index]!, bare: true, onContinue: onSaved }
      : saves
      ? // The essentials' heading and About's intro would repeat the wizard step's own title and lead.
        { id: STEP_IDS[index]!, register: (save) => void parts.set(STEP_IDS[index]!, save), heading: index > 0, intro: index > 1 }
      : {
          id: STEP_IDS[index]!,
          onContinue: onDone && (index === STEP_IDS.length - 1 ? onDone : () => showStep(STEP_IDS[index + 1]!)),
          last: index === STEP_IDS.length - 1,
        };
  const show = (which: DetailsPart) => !part || part === which;
  return (
    <div className="flex flex-col gap-6">
      {!profile.me.canEdit && <Notice>{t('details.viewOnly')}</Notice>}
      {show('essentials') && <Essentials profile={profile} flow={flow(0)} />}
      {show('story') && <About profile={profile} flow={flow(1)} />}
      {show('story') && <Family profile={profile} flow={flow(2)} />}
      {(show('story') || part === 'lifestyle') && <Lifestyle profile={profile} flow={flow(3)} />}
    </div>
  );
}
