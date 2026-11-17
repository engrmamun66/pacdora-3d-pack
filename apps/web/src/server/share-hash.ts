import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env } from "./env";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (l, o, 0, 1), lower case: safe in any URL

const encode = (bytes: Uint8Array, length: number) => Array.from(bytes.slice(0, length), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** A new random hash for a share link (12 characters from a 32-letter alphabet: about 2^60 possibilities). */
export const newShareHash = () => encode(randomBytes(12), 12);

/**
 * The permanent hash of one template (project) in public addresses. It is calculated from the project id and a server secret,
 * so it needs no table, never changes, and cannot be guessed from the id.
 */
export const templateHash = (projectId: string) => encode(createHmac("sha256", env.BETTER_AUTH_SECRET).update(`template:${projectId}`).digest(), 12);

/** A hash must look like one before it is used in a query. */
export const isHash = (s: string) => /^[a-km-np-z2-9]{12}$/.test(s);
