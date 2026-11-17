"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** What a customer put in the cart on one Client's portal. Kept in this browser (per Client) until the order is placed. */
export interface CartLine {
  hash: string;
  name: string;
  thumbnail: string | null;
  quantity: number;
  details: string;
}

const key = (userHash: string) => `portal-cart:${userHash}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const read = (userHash: string): string => {
  try {
    return localStorage.getItem(key(userHash)) ?? "[]";
  } catch {
    return "[]";
  }
};
const write = (userHash: string, lines: CartLine[]) => {
  try {
    localStorage.setItem(key(userHash), JSON.stringify(lines));
  } catch {
    // storage full or blocked: the cart then lasts only until the page is closed
  }
  emit();
};

const parse = (raw: string): CartLine[] => {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((l): l is CartLine => typeof l?.hash === "string" && typeof l?.quantity === "number") : [];
  } catch {
    return [];
  }
};

export function useCart(userHash: string) {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => read(userHash),
    () => "[]",
  );
  const lines = useMemo(() => parse(raw), [raw]);
  const add = useCallback(
    (line: Omit<CartLine, "quantity" | "details"> & { quantity?: number; details?: string }) => {
      const now = parse(read(userHash));
      const at = now.findIndex((l) => l.hash === line.hash);
      const q = Math.max(1, Math.floor(line.quantity ?? 1));
      if (at >= 0) now[at] = { ...now[at]!, quantity: Math.min(1_000_000, now[at]!.quantity + q), details: line.details ?? now[at]!.details };
      else now.push({ hash: line.hash, name: line.name, thumbnail: line.thumbnail, quantity: q, details: line.details ?? "" });
      write(userHash, now);
    },
    [userHash],
  );
  const patch = useCallback(
    (hash: string, p: Partial<Pick<CartLine, "quantity" | "details">>) => {
      write(userHash, parse(read(userHash)).map((l) => (l.hash === hash ? { ...l, ...p, quantity: Math.max(1, Math.min(1_000_000, Math.floor(p.quantity ?? l.quantity))) } : l)));
    },
    [userHash],
  );
  const remove = useCallback((hash: string) => write(userHash, parse(read(userHash)).filter((l) => l.hash !== hash)), [userHash]);
  const clear = useCallback(() => write(userHash, []), [userHash]);
  return { lines, count: lines.reduce((a, l) => a + l.quantity, 0), add, patch, remove, clear };
}
