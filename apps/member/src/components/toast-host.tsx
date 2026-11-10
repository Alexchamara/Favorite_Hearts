/**
 * Where toasts render. The demo puts its <Toaster> inside .m-app (product/preview/matrimony.tsx), so toasts take the
 * app's theme tokens and radius; outside it they stayed light in dark mode. Here every page has its own .m-app root
 * (AppShell, EntryShell), and a toast is often shown just before a page changes ("Profile deleted", then home), so
 * one Toaster renders into one holder element that moves into whichever root is on screen: the Toaster stays mounted
 * and keeps its toasts. The holder is display: contents (parity.css), so it adds no box.
 */
import { useLayoutEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Toaster } from '@/components/ui/sonner';
import { portalContainer } from '@/lib/utils';

let holder: HTMLDivElement | null = null;
const roots: HTMLElement[] = [];

function getHolder(): HTMLDivElement {
  if (!holder) {
    holder = document.createElement('div');
    holder.className = 'm-toast-host';
  }
  return holder;
}

/** Puts the holder first in the newest root, as the demo's Toaster is .m-app's first child; else in the wrapper. */
function place() {
  const target = roots[roots.length - 1] ?? portalContainer();
  if (target && getHolder().parentElement !== target) target.prepend(getHolder());
}

/** Called by each page-level .m-app root: toasts render inside it while it is on screen. */
export function useToastRoot(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    roots.push(root);
    place();
    return () => {
      roots.splice(roots.indexOf(root), 1);
      place();
    };
  }, [ref]);
}

/** The one Toaster, rendered once in App. */
export function ToastLayer(props: React.ComponentProps<typeof Toaster>) {
  return createPortal(<Toaster {...props} />, getHolder());
}
