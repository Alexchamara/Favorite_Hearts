import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets later Tailwind classes win (used by components/ui). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Where dialogs, sheets, menus and popovers render: inside the demo's #favorite-hearts-product wrapper, as the demo's
 * build arranged it, so the demo's stylesheets (scoped to that id) reach them. Falls back to <body> before it mounts.
 */
export function portalContainer(): HTMLElement | undefined {
  return document.getElementById('favorite-hearts-product') ?? undefined;
}
