"use client";

import { useSyncExternalStore } from "react";
import { createPref } from "./local-pref";

/**
 * A size the user sets by dragging (a split, a height), kept in localStorage: the next visit starts with it.
 * `useSize()` reads it without a flash or a hydration mismatch (the server and the first paint use `fallback`).
 * A stored value that is not a number, or is out of range, is ignored.
 */
export function createSize(key: string, fallback: number, min: number, max: number) {
  const ok = (v: string | null): v is string => v !== null && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
  const pref = createPref<string>(key, String(fallback), ok);
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
  const useSize = (): [number, (n: number) => void] => {
    const value = Number(useSyncExternalStore(pref.subscribe, pref.read, () => pref.fallback));
    return [value, (n) => pref.write(String(clamp(n)))];
  };
  return { useSize, fallback };
}
