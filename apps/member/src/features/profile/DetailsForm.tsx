/**
 * The profile editor in four steps (spec 5.2: essentials, story, family, lifestyle). Each step
 * saves on its own, sending only what changed with the version it was based on (spec A05).
 */
import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PROFILE_VALUES, profileFieldsSchema, type ProfileFields, type ProfileView } from '@fh/shared';
import { CheckboxField, ChipPicker, ListField, SelectField, TextAreaField, TextField } from '@/components/form/fields';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage, patch } from '@/lib/api';
import { keys, storeProfile } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import {
  childrenLabels,
  communityLabels,
  countries,
  dietLabels,
  genderLabels,
  habitLabels,
  horoscopeLabels,
  incomeLabels,
  involvementLabels,
  maritalLabels,
  options,
  relocationLabels,
  religionLabels,
  SPOKEN_LANGUAGES,
  SRI_LANKA_DISTRICTS,
  timelineLabels,
  valueLabels,
} from './options';

type Key = Exclude<keyof ProfileFields, 'caste' | 'adultDeclaredAt'>;
type FormValue = string | string[];

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
    mutationFn: (payload: Record<string, unknown>) => patch<ProfileView>(`/profiles/${profile.id}`, { version: profile.version, ...payload }),
    onSuccess: async (updated) => {
      toast.success('Saved.');
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

  /** Validates the changed fields like the server will, then saves them. */
  function submit(extra: Record<string, unknown> = {}) {
    const payload: Record<string, unknown> = { ...extra };
    const found: Record<string, string> = {};
    for (const key of fields) {
      if (same(values[key], initial[key])) continue;
      const value = fromForm(key, values[key]);
      if (value === null && REQUIRED.has(key)) found[key] = 'Required.';
      else payload[key] = value;
    }
    const checked = profileFieldsSchema.safeParse(payload);
    if (!checked.success) for (const issue of checked.error.issues) found[issue.path.join('.')] ??= issue.message;
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!Object.keys(payload).length) return toast('Nothing has changed.');
    save.mutate(payload);
  }
  return { values, set, text, list, errors, submit, saving: save.isPending, failed: save.error };
}

function Step({ title, intro, children, onSave, saving, failed, canEdit }: { title: string; intro?: string; children: ReactNode; onSave: () => void; saving: boolean; failed: unknown; canEdit: boolean }) {
  return (
    <Card>
      <h2 className="font-serif text-2xl">{title}</h2>
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
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

const full = 'sm:col-span-2';

function Essentials({ profile }: { profile: ProfileView }) {
  const f = useStep(profile, ['displayName', 'gender', 'birthDate', 'countryCode', 'region', 'city', 'occupation', 'education', 'heightCm', 'maritalStatus', 'religion', 'languages', 'motherTongue']);
  const inSriLanka = f.text('countryCode') === 'LK';
  return (
    <Step title="Essentials" intro="The basics members see first. Use the candidate’s first name." onSave={() => f.submit()} saving={f.saving} failed={f.failed} canEdit={profile.me.canEdit}>
      <TextField label="Name" maxLength={60} value={f.text('displayName')} onChange={f.set('displayName')} error={f.errors.displayName} />
      <SelectField label="Gender" value={f.text('gender')} onChange={f.set('gender')} options={options(genderLabels)} error={f.errors.gender} />
      <TextField label="Date of birth" type="date" value={f.text('birthDate')} onChange={f.set('birthDate')} error={f.errors.birthDate} hint="Only the age is shown to others." />
      <SelectField label="Marital status" value={f.text('maritalStatus')} onChange={f.set('maritalStatus')} options={options(maritalLabels)} error={f.errors.maritalStatus} />
      <SelectField
        label="Country"
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
          label="District"
          value={f.text('region')}
          onChange={f.set('region')}
          options={SRI_LANKA_DISTRICTS.map((district) => ({ value: district, label: district }))}
          error={f.errors.region}
        />
      ) : (
        <TextField label="Region or state (optional)" maxLength={80} value={f.text('region')} onChange={f.set('region')} error={f.errors.region} />
      )}
      <TextField label="City or town" maxLength={80} value={f.text('city')} onChange={f.set('city')} error={f.errors.city} />
      <TextField label="Height (cm)" type="number" inputMode="numeric" min={100} max={230} value={f.text('heightCm')} onChange={f.set('heightCm')} error={f.errors.heightCm} />
      <TextField label="Occupation" maxLength={100} value={f.text('occupation')} onChange={f.set('occupation')} error={f.errors.occupation} />
      <TextField label="Education" maxLength={200} value={f.text('education')} onChange={f.set('education')} error={f.errors.education} />
      <SelectField label="Religion" value={f.text('religion')} onChange={f.set('religion')} options={options(religionLabels)} error={f.errors.religion} />
      <TextField label="Mother tongue (optional)" maxLength={80} value={f.text('motherTongue')} onChange={f.set('motherTongue')} error={f.errors.motherTongue} />
      <div className={full}>
        <ChipPicker
          label="Languages spoken"
          max={10}
          value={f.list('languages')}
          onChange={f.set('languages')}
          options={SPOKEN_LANGUAGES.map((language) => ({ value: language, label: language }))}
          error={f.errors.languages}
        />
      </div>
    </Step>
  );
}

function About({ profile }: { profile: ProfileView }) {
  const f = useStep(profile, ['bio', 'values', 'hobbies', 'timeline', 'relocation', 'horoscopeImportance', 'incomeRange']);
  return (
    <Step
      title="About"
      intro="Describe everyday life and what matters. Do not put phone numbers or an exact address here."
      onSave={() => f.submit()}
      saving={f.saving}
      failed={f.failed}
      canEdit={profile.me.canEdit}
    >
      <TextAreaField className={full} label="About" maxLength={600} value={f.text('bio')} onChange={f.set('bio')} error={f.errors.bio} />
      <div className={full}>
        <ChipPicker label="Values" max={5} value={f.list('values')} onChange={f.set('values')} options={PROFILE_VALUES.map((value) => ({ value, label: valueLabels[value] }))} error={f.errors.values} />
      </div>
      <div className={full}>
        <ListField label="Hobbies" max={6} maxLength={50} placeholder="e.g. Hiking" value={f.list('hobbies')} onChange={f.set('hobbies')} error={f.errors.hobbies} />
      </div>
      <SelectField label="Marriage timeline" value={f.text('timeline')} onChange={f.set('timeline')} options={options(timelineLabels)} error={f.errors.timeline} />
      <SelectField label="Relocation" value={f.text('relocation')} onChange={f.set('relocation')} options={options(relocationLabels)} error={f.errors.relocation} />
      <SelectField label="Horoscope matching" value={f.text('horoscopeImportance')} onChange={f.set('horoscopeImportance')} options={options(horoscopeLabels)} error={f.errors.horoscopeImportance} />
      <SelectField
        label="Monthly income (self-declared)"
        hint="Shown on the profile as self-declared."
        value={f.text('incomeRange')}
        onChange={f.set('incomeRange')}
        options={options(incomeLabels)}
        error={f.errors.incomeRange}
      />
    </Step>
  );
}

function Family({ profile }: { profile: ProfileView }) {
  const f = useStep(profile, ['familyStory', 'motherName', 'motherOccupation', 'fatherName', 'fatherOccupation', 'sisters', 'brothers', 'familyInvolvement']);
  return (
    <Step title="Family" intro="All optional. Other members can see what you add here." onSave={() => f.submit()} saving={f.saving} failed={f.failed} canEdit={profile.me.canEdit}>
      <TextAreaField className={full} label="Family story" maxLength={600} value={f.text('familyStory')} onChange={f.set('familyStory')} error={f.errors.familyStory} />
      <TextField label="Mother’s name" maxLength={80} value={f.text('motherName')} onChange={f.set('motherName')} error={f.errors.motherName} />
      <TextField label="Mother’s occupation" maxLength={100} value={f.text('motherOccupation')} onChange={f.set('motherOccupation')} error={f.errors.motherOccupation} />
      <TextField label="Father’s name" maxLength={80} value={f.text('fatherName')} onChange={f.set('fatherName')} error={f.errors.fatherName} />
      <TextField label="Father’s occupation" maxLength={100} value={f.text('fatherOccupation')} onChange={f.set('fatherOccupation')} error={f.errors.fatherOccupation} />
      <ListField label="Sisters (occupation)" max={12} maxLength={100} placeholder="e.g. Teacher" value={f.list('sisters')} onChange={f.set('sisters')} error={f.errors.sisters} />
      <ListField label="Brothers (occupation)" max={12} maxLength={100} placeholder="e.g. Engineer" value={f.list('brothers')} onChange={f.set('brothers')} error={f.errors.brothers} />
      <SelectField label="Family involvement" value={f.text('familyInvolvement')} onChange={f.set('familyInvolvement')} options={options(involvementLabels)} error={f.errors.familyInvolvement} />
    </Step>
  );
}

function Lifestyle({ profile }: { profile: ProfileView }) {
  const f = useStep(profile, ['diet', 'smoking', 'drinking', 'childrenPlan', 'communityOpenness']);
  const savedCaste = profile.fields.caste?.value ?? '';
  const [caste, setCaste] = useState(savedCaste);
  const [consent, setConsent] = useState(Boolean(savedCaste));
  const casteChanged = caste.trim() !== savedCaste;
  return (
    <Step
      title="Lifestyle and community"
      intro="All optional."
      onSave={() => f.submit(casteChanged ? { caste: caste.trim() ? { value: caste.trim(), consent } : null } : {})}
      saving={f.saving}
      failed={f.failed}
      canEdit={profile.me.canEdit}
    >
      <SelectField label="Diet" value={f.text('diet')} onChange={f.set('diet')} options={options(dietLabels)} placeholder="Not shared" />
      <SelectField label="Children" value={f.text('childrenPlan')} onChange={f.set('childrenPlan')} options={options(childrenLabels)} placeholder="Not shared" />
      <SelectField label="Smoking" value={f.text('smoking')} onChange={f.set('smoking')} options={options(habitLabels)} placeholder="Not shared" />
      <SelectField label="Drinking" value={f.text('drinking')} onChange={f.set('drinking')} options={options(habitLabels)} placeholder="Not shared" />
      <SelectField className={full} label="Community" value={f.text('communityOpenness')} onChange={f.set('communityOpenness')} options={options(communityLabels)} placeholder="Not shared" />
      <div className={`${full} flex flex-col gap-3 rounded-[12px] border border-dashed p-4`}>
        <TextField
          label="Caste or community (optional)"
          hint="Shown to signed-in members only, never to visitors, and members can filter by it. Leave empty to not share; you can remove it at any time."
          maxLength={80}
          value={caste}
          onChange={setCaste}
          error={f.errors.caste ?? f.errors['caste.value']}
        />
        {caste.trim() && (
          <CheckboxField
            checked={consent}
            onChange={setConsent}
            error={f.errors['caste.consent']}
            label="I agree that this is shown on the profile to signed-in members and can be used in their filters."
          />
        )}
      </div>
    </Step>
  );
}

export function DetailsForm({ profile }: { profile: ProfileView }) {
  return (
    <div className="flex flex-col gap-6">
      {!profile.me.canEdit && <Notice>You can view these details but not change them.</Notice>}
      <Essentials profile={profile} />
      <About profile={profile} />
      <Family profile={profile} />
      <Lifestyle profile={profile} />
    </div>
  );
}
