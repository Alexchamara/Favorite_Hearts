import config from '../../site.config.json';

export type SiteConfig = typeof config;
export const site: SiteConfig = config;

/** Absolute site origin without trailing slash, e.g. https://example.com */
export const base = site.siteUrl.replace(/\/$/, '');

/** Versioned URL of a stylesheet in public/assets/css (bump `release` to bust caches). */
export const css = (file: string) => `/assets/css/${file}?v=${site.release}`;

/** Versioned URL of a script in public/assets/js. */
export const js = (file: string) => `/assets/js/${file}?v=${site.release}`;
