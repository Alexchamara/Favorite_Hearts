/**
 * The newsroom's articles, newest first as the newsroom lists them. Their words are catalogue keys
 * (web.article.<slug>.title, .intro, .s1.title … .s3.text, .summary); this list holds what is not text.
 * All were published in October 2026.
 */
export const CATEGORIES = ['product', 'advice', 'safety', 'company', 'stories', 'impact'] as const;
export type Category = (typeof CATEGORIES)[number];

export type Article = { slug: string; photo: number; category: Category; related: [string, string] };

export const ARTICLES: Article[] = [
  { slug: 'a-thoughtful-beginning', photo: 6271529, category: 'company', related: ['matrimony-with-more-heart', 'respect-in-every-introduction'] },
  { slug: 'matrimony-with-more-heart', photo: 8836421, category: 'product', related: ['respect-in-every-introduction', 'belonging-across-borders'] },
  { slug: 'respect-in-every-introduction', photo: 3967505, category: 'safety', related: ['belonging-across-borders', 'beyond-the-checklist'] },
  { slug: 'belonging-across-borders', photo: 5910748, category: 'impact', related: ['beyond-the-checklist', 'a-first-conversation'] },
  { slug: 'beyond-the-checklist', photo: 5910748, category: 'advice', related: ['a-first-conversation', 'family-and-your-voice'] },
  { slug: 'a-first-conversation', photo: 8836421, category: 'advice', related: ['family-and-your-voice', 'across-borders-on-the-same-page'] },
  { slug: 'family-and-your-voice', photo: 3967505, category: 'advice', related: ['across-borders-on-the-same-page', 'before-marriage'] },
  { slug: 'across-borders-on-the-same-page', photo: 5910748, category: 'advice', related: ['before-marriage', 'an-honest-profile'] },
  { slug: 'before-marriage', photo: 8836421, category: 'advice', related: ['an-honest-profile', 'a-thoughtful-beginning'] },
  { slug: 'an-honest-profile', photo: 3967505, category: 'advice', related: ['a-thoughtful-beginning', 'matrimony-with-more-heart'] },
];

export const PUBLISHED = { month: 10, year: 2026, datetime: '2026-10' };
export const SECTIONS = [1, 2, 3] as const;

/** A Pexels photo at a width; the local photo stands in if it fails to load (data-stock-fallback). */
export const photoUrl = (photo: number, width: number) =>
  `https://images.pexels.com/photos/${photo}/pexels-photo-${photo}.jpeg?auto=compress&cs=tinysrgb&w=${width}&q=90`;
export const PHOTO_FALLBACK = '/assets/labs-couple.jpg';
