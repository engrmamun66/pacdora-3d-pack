"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile "I'm not a robot" widget.
 *
 * The browser only obtains a one-time token; the SERVER verifies it with
 * Cloudflare (Better Auth captcha plugin) before processing the request.
 * Tokens are single-use, so call reset() after every submit attempt.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the human verification widget."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  siteKey: string;
  /** Change this value to reset the widget (e.g. after a submit used the token). */
  resetKey: number;
  onToken: (token: string | null) => void;
  onError?: (message: string) => void;
}

export function Turnstile({ siteKey, resetKey, onToken, onError }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Keep latest callbacks without re-creating the widget.
  const cb = useRef({ onToken, onError });
  useEffect(() => {
    cb.current = { onToken, onError };
  });

  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (token: string) => cb.current.onToken(token),
          "expired-callback": () => cb.current.onToken(null),
          "error-callback": () => {
            cb.current.onToken(null);
            cb.current.onError?.("Human verification failed to load. Please retry.");
          },
        });
      })
      .catch((e: Error) => cb.current.onError?.(e.message));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  return <div ref={box} className="min-h-[65px]" />;
}
