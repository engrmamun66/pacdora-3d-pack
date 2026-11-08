"use client";
import { createAuthClient } from "better-auth/react";

/** Browser auth client. Same origin, so no baseURL needed. */
export const authClient = createAuthClient();

/** Header the server-side captcha plugin reads. */
export const captchaHeaders = (token: string) => ({ "x-captcha-response": token });
