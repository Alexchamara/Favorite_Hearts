/**
 * Wording for the shared value lists (@fh/shared domain.ts), in the reader's language. Each value's label is the key
 * `option.<list>.<value>` in the `app` catalogue (packages/shared/src/i18n), so the reviewer corrects it in the
 * spreadsheet. Values are stored as they are; only their labels change with the language. Staff screens get English.
 */
import { useMemo } from 'react';
import {
  CHILDREN_PLANS,
  COMMUNITY_OPENNESS,
  CONTACT_KINDS,
  CONTACT_PERSONS,
  DIETS,
  DOCUMENT_TYPES,
  FAMILY_INVOLVEMENT,
  GENDERS,
  HABIT_FREQUENCIES,
  HOROSCOPE_IMPORTANCE,
  INCOME_RANGES,
  INTEREST_STATUSES,
  MANAGER_RELATIONSHIPS,
  MARITAL_STATUSES,
  PROFILE_STATUSES,
  PROFILE_VALUES,
  RELIGIONS,
  RELOCATION_PREFERENCES,
  REPORT_CATEGORIES,
  SOCIAL_PLATFORMS,
  TIMELINES,
  VERIFICATION_STATUSES,
  type Language,
} from '@fh/shared';
import { englishText, hasText, textIn, useI18n, type AppTextKey, type Translate } from '@/lib/i18n';
import countryList from './countries.json';

/** Each list by the name screens use (statusLabels[status]), with its catalogue group and values. */
const LISTS = {
  genderLabels: ['gender', GENDERS],
  maritalLabels: ['marital', MARITAL_STATUSES],
  religionLabels: ['religion', RELIGIONS],
  timelineLabels: ['timeline', TIMELINES],
  relocationLabels: ['relocation', RELOCATION_PREFERENCES],
  incomeLabels: ['income', INCOME_RANGES],
  horoscopeLabels: ['horoscope', HOROSCOPE_IMPORTANCE],
  dietLabels: ['diet', DIETS],
  habitLabels: ['habit', HABIT_FREQUENCIES],
  childrenLabels: ['children', CHILDREN_PLANS],
  involvementLabels: ['involvement', FAMILY_INVOLVEMENT],
  communityLabels: ['community', COMMUNITY_OPENNESS],
  valueLabels: ['value', PROFILE_VALUES],
  relationshipLabels: ['relationship', MANAGER_RELATIONSHIPS],
  statusLabels: ['status', PROFILE_STATUSES],
  documentLabels: ['document', DOCUMENT_TYPES],
  /** A document review's outcome, in the badge's words (section 5: "reviewed", never "government verified"). */
  caseStatusLabels: ['caseStatus', VERIFICATION_STATUSES],
  contactKindLabels: ['contactKind', CONTACT_KINDS],
  contactPersonLabels: ['contactPerson', CONTACT_PERSONS],
  interestStatusLabels: ['interestStatus', INTEREST_STATUSES],
  /** Section 7: the first four hide the content after one report. */
  reportCategoryLabels: ['reportCategory', REPORT_CATEGORIES],
  platformLabels: ['platform', SOCIAL_PLATFORMS],
} as const;

export type LabelSet = { [K in keyof typeof LISTS]: Record<(typeof LISTS)[K][1][number], string> };

/** Field names as members read them (used for "still needed" lists and errors). */
const FIELDS = [
  'displayName', 'gender', 'birthDate', 'countryCode', 'region', 'city', 'occupation', 'education', 'heightCm',
  'maritalStatus', 'bio', 'adultDeclaredAt', 'contactPhone',
] as const;

export function labelsFor(t: Translate) {
  const lists = Object.fromEntries(
    Object.entries(LISTS).map(([name, [group, values]]) => [
      name,
      Object.fromEntries(values.map((value) => [value, t(`option.${group}.${value}` as AppTextKey)])),
    ]),
  ) as LabelSet;
  const fieldLabels: Record<string, string> = Object.fromEntries(FIELDS.map((field) => [field, t(`field.${field}` as AppTextKey)]));
  return { ...lists, fieldLabels };
}

/** Staff screens only: the same lists, always in English (owner, 3 Nov 2026). Members use useLabels(). */
export const ENGLISH_LABELS = labelsFor(englishText);

/** The value lists' labels in the language on screen. */
export function useLabels() {
  const { t } = useI18n();
  return useMemo(() => labelsFor(t), [t]);
}

/**
 * Suggestions offered for spoken languages and Sri Lankan districts. The member's choice is stored in English, as it
 * always was; only the label is translated. Anything the member typed themselves is shown as written.
 */
export const SPOKEN_LANGUAGES = ['Sinhala', 'Tamil', 'English', 'Hindi', 'Arabic', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Malay', 'Urdu'];

export const SRI_LANKA_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota', 'Jaffna',
  'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** A stored spoken language or district, in the reader's words when it is one of the suggestions. */
export function suggestionLabel(t: Translate, list: 'spokenLanguage' | 'district', value: string): string {
  const key = `option.${list}.${slug(value)}`;
  return hasText(key) ? t(key as AppTextKey) : value;
}

/**
 * Countries, in the order of their names in the reader's language. The names are catalogue texts (`country.XX`); the
 * Sinhala drafts came from the Unicode CLDR list, for the reviewer to check, so no browser's own data is relied on.
 */
export function countriesIn(language: Language): { code: string; name: string }[] {
  if (language === 'en') return countryList;
  return countryList
    .map(({ code }) => ({ code, name: textIn(language, `country.${code}` as AppTextKey) }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
}

export function useCountries() {
  const { language } = useI18n();
  return useMemo(() => countriesIn(language), [language]);
}

export const countryNameIn = (countries: { code: string; name: string }[], code: string | null | undefined) =>
  (code && countries.find((country) => country.code === code)?.name) || code || '';

export const options = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
