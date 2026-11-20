"use client";

/**
 * A choice kept in localStorage that React can read without a flash or a hydration mismatch.
 * If storage is blocked (private mode) the choice lasts for this visit only.
 */
export function createPref<T extends string>(key: string, fallback: T, valid: (v: string | null) => v is T) {
  let memory: T | null = null;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (memory) return memory;
    try {
      const v = localStorage.getItem(key);
      return valid(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  };
  const write = (v: T) => {
    memory = v;
    try {
      localStorage.setItem(key, v);
    } catch {
      /* kept in memory only */
    }
    listeners.forEach((f) => f());
  };
  return { read, subscribe, write, fallback };
}
