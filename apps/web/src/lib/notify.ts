"use client";

import { toast } from "sonner";

/**
 * One place for pop-up messages (bottom-right Toaster, mounted in the root layout).
 * Errors and warnings stay longer than successes. Pass `id` to replace an earlier
 * toast of the same kind instead of stacking duplicates.
 */
type Opts = { id?: string; description?: string };

export const notify = {
  success: (message: string, o: Opts = {}) => toast.success(message, { duration: 4000, ...o }),
  error: (message: string, o: Opts = {}) => toast.error(message, { duration: 8000, ...o }),
  info: (message: string, o: Opts = {}) => toast.info(message, { duration: 6000, ...o }),
  warning: (message: string, o: Opts = {}) => toast.warning(message, { duration: 8000, ...o }),
  dismiss: (id?: string) => toast.dismiss(id),
  /** Resolve a pending toast when an async job ends. */
  promise: <T,>(p: Promise<T>, msgs: { loading: string; success: string; error: string }) => toast.promise(p, msgs),
};
