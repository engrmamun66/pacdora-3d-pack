/**
 * Calendar days as plain "YYYY-MM-DD" text (no time zone), the form the date pickers and the page addresses use.
 * Kept free of the DOM and React so a mobile app can share it.
 */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-19" -> a Date at local midnight, or undefined when the text is not a real day. */
export function parseDay(text: string | undefined | null): Date | undefined {
  const m = text ? DAY.exec(text) : null;
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : undefined;
}

/** A Date -> "YYYY-MM-DD" using its local calendar day. */
export function formatDay(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "19 Nov 2026", for showing a day to people. */
export function showDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
