/**
 * English wording for the shared value lists (@fh/shared domain.ts). Sinhala arrives with the
 * copy export in Stage 5; keep every visible label here so it can be exported in one place.
 */
import type {
  CHILDREN_PLANS,
  COMMUNITY_OPENNESS,
  DIETS,
  DOCUMENT_TYPES,
  FAMILY_INVOLVEMENT,
  GENDERS,
  HABIT_FREQUENCIES,
  HOROSCOPE_IMPORTANCE,
  INCOME_RANGES,
  MANAGER_RELATIONSHIPS,
  MARITAL_STATUSES,
  PROFILE_STATUSES,
  PROFILE_VALUES,
  RELIGIONS,
  RELOCATION_PREFERENCES,
  SOCIAL_PLATFORMS,
  TIMELINES,
  VERIFICATION_STATUSES,
} from '@fh/shared';
import countryList from './countries.json';

type Labels<T extends readonly string[]> = Record<T[number], string>;

export const genderLabels: Labels<typeof GENDERS> = { man: 'Man', woman: 'Woman' };
export const maritalLabels: Labels<typeof MARITAL_STATUSES> = {
  never_married: 'Never married',
  divorced: 'Divorced',
  widowed: 'Widowed',
  separated: 'Separated',
};
export const religionLabels: Labels<typeof RELIGIONS> = {
  buddhist: 'Buddhist',
  hindu: 'Hindu',
  christian: 'Christian',
  muslim: 'Muslim',
  sikh: 'Sikh',
  jain: 'Jain',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};
export const timelineLabels: Labels<typeof TIMELINES> = {
  ready: 'Ready for marriage',
  within_1_2_years: 'Marriage in 1–2 years',
  within_2_3_years: 'Marriage in 2–3 years',
  open_to_discussing: 'Open to discussing',
};
export const relocationLabels: Labels<typeof RELOCATION_PREFERENCES> = {
  open_to_relocating: 'Open to relocating',
  prefer_to_stay: 'Prefer to stay where I live',
  open_to_discussing: 'Open to discussing',
};
export const incomeLabels: Labels<typeof INCOME_RANGES> = {
  prefer_not_to_say: 'Prefer not to say',
  no_personal_income: 'No personal income',
  below_50k: 'Below LKR 50,000',
  from_50k_to_99k: 'LKR 50,000–99,999',
  from_100k_to_199k: 'LKR 100,000–199,999',
  from_200k_to_349k: 'LKR 200,000–349,999',
  from_350k_to_499k: 'LKR 350,000–499,999',
  from_500k_to_999k: 'LKR 500,000–999,999',
  from_1m: 'LKR 1,000,000 or more',
};
export const horoscopeLabels: Labels<typeof HOROSCOPE_IMPORTANCE> = {
  essential: 'Matching is essential',
  preferred_but_open: 'Prefer matching, but open to discussion',
  family_prefers: 'Family prefers matching',
  not_important: 'Do not care about matching',
  prefer_not_to_say: 'Prefer not to say',
};
export const dietLabels: Labels<typeof DIETS> = {
  vegetarian: 'Vegetarian',
  non_vegetarian: 'Non-vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
};
export const habitLabels: Labels<typeof HABIT_FREQUENCIES> = { never: 'Never', occasionally: 'Occasionally', regularly: 'Regularly' };
export const childrenLabels: Labels<typeof CHILDREN_PLANS> = {
  would_like: 'Would like children',
  do_not_want: 'Do not want children',
  open_to_discussing: 'Open to discussing',
};
export const involvementLabels: Labels<typeof FAMILY_INVOLVEMENT> = {
  candidate_led: 'Candidate-led',
  family_involved: 'Family involved',
  decide_together: 'Decide together',
};
export const communityLabels: Labels<typeof COMMUNITY_OPENNESS> = {
  open_to_any: 'Open to any community',
  prefer_shared: 'Prefer a shared community',
  open_to_discussing: 'Open to discussing',
};
export const valueLabels: Labels<typeof PROFILE_VALUES> = {
  kindness: 'Kindness',
  family: 'Family',
  honesty: 'Honesty',
  growth: 'Growth',
  learning: 'Learning',
  independence: 'Independence',
  faith: 'Faith',
  creativity: 'Creativity',
  adventure: 'Adventure',
  balance: 'Balance',
};
export const relationshipLabels: Labels<typeof MANAGER_RELATIONSHIPS> = {
  mother: 'Mother',
  father: 'Father',
  guardian: 'Guardian',
  family_member: 'Family member',
  authorized_person: 'Authorized person',
};
export const statusLabels: Labels<typeof PROFILE_STATUSES> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  engaged_or_married: 'Engaged or married',
  suspended: 'Suspended',
  deleted: 'Deleted',
};
export const documentLabels: Labels<typeof DOCUMENT_TYPES> = {
  nic: 'National identity card (NIC)',
  passport: 'Passport',
  driving_licence: 'Driving licence',
};
/** A document review's outcome, in the badge's words (section 5: "reviewed", never "government verified"). */
export const caseStatusLabels: Labels<typeof VERIFICATION_STATUSES> = {
  pending: 'Waiting for review',
  approved: 'Reviewed and accepted',
  rejected: 'Not accepted',
};
export const platformLabels: Labels<typeof SOCIAL_PLATFORMS> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  website: 'Website',
};

/** Field names as members read them (used for "still needed" lists and errors). */
export const fieldLabels: Record<string, string> = {
  displayName: 'Name',
  gender: 'Gender',
  birthDate: 'Date of birth',
  countryCode: 'Country',
  region: 'District or region',
  city: 'City or town',
  occupation: 'Occupation',
  education: 'Education',
  heightCm: 'Height',
  maritalStatus: 'Marital status',
  bio: 'About',
  adultDeclaredAt: 'Adult declaration',
  contactPhone: 'A contact phone number',
};

export const SPOKEN_LANGUAGES = ['Sinhala', 'Tamil', 'English', 'Hindi', 'Arabic', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Malay', 'Urdu'];

export const SRI_LANKA_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota', 'Jaffna',
  'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

export const countries: { code: string; name: string }[] = countryList;

export const options = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
