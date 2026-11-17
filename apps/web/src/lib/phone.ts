/**
 * Mobile numbers of Bangladesh, the numbers customers sign in with (a code is sent by SMS).
 * One canonical form is stored: country code and number, digits only, e.g. 8801712345678.
 */
const BD = /^8801[3-9]\d{8}$/;

/** Accepts 01712345678, 1712345678, 8801712345678, +880 1712-345678, (880) 01712 345678 ...; returns the canonical form or null. */
export function normalizeBdPhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("00880")) d = d.slice(2);
  if (d.startsWith("8800")) d = "880" + d.slice(4); // 880 01712...: the leading zero is not part of the number
  if (d.startsWith("01")) d = "88" + d;
  else if (/^1[3-9]\d{8}$/.test(d)) d = "880" + d;
  return BD.test(d) ? d : null;
}

/** 8801712345678 -> +880 1712-345678 (for screens and messages). */
export function formatPhone(p: string): string {
  return BD.test(p) ? `+880 ${p.slice(3, 7)}-${p.slice(7)}` : p;
}

/** 8801712345678 -> +880 17••-••5678 (shown where the whole number should not be). */
export function maskPhone(p: string): string {
  return BD.test(p) ? `+880 ${p.slice(3, 5)}••-••${p.slice(-4)}` : "••••";
}
