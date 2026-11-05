import { useRef } from 'react';

type FocusHandlers = { onOpenAutoFocus?: (event: Event) => void; onCloseAutoFocus?: (event: Event) => void };

/**
 * Puts focus back on what had it when a dialog opened (spec U02, "focus retained/restored"). Radix returns focus to
 * a Trigger, but most dialogs here open from state without one, so focus would otherwise fall to the top of the page.
 */
export function useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus }: FocusHandlers): Required<FocusHandlers> {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const element = opener.current;
      opener.current = null;
      if (element?.isConnected) {
        event.preventDefault();
        element.focus();
      }
    },
  };
}
