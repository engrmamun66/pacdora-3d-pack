"use client";

/**
 * One confirmation box for the whole app (rendered by <ConfirmHost />, mounted in the root layout).
 * `await confirmAction({ ... })` is true when the person confirms, false on Cancel, Escape or a click outside.
 * Use it before anything that deletes or cannot be undone, instead of the browser's own window.confirm.
 */
export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Text of the confirm button (default "Confirm", or "Delete" for the danger tone). */
  confirmLabel?: string;
  /** "danger" makes the confirm button red. Default "danger". */
  tone?: "danger" | "default";
}

type Opener = (o: ConfirmOptions) => Promise<boolean>;
let opener: Opener | null = null;

/** Called by the host when it appears and goes. */
export function registerConfirmHost(fn: Opener | null) {
  opener = fn;
}

export function confirmAction(o: ConfirmOptions): Promise<boolean> {
  // No host on the page (should not happen): fall back to the browser's own box rather than doing nothing.
  if (!opener) return Promise.resolve(window.confirm(o.description ? `${o.title}\n\n${o.description}` : o.title));
  return opener(o);
}
