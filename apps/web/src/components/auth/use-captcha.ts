"use client";

import { useCallback, useState } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * Current one-time captcha token. Tokens are single-use: call reset() after
 * every submit; it clears the token and bumps resetKey so the widget re-arms.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setResetKey((k) => k + 1);
  }, []);
  return { token, error, resetKey, onToken: setToken, onError: setError, reset };
}
