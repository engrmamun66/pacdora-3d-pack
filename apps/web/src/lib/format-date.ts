const f = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
const d = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" });
/** One fixed time zone, so a page reads the same on the server and in the browser. */
export const fmtDateTime = (iso: string) => f.format(new Date(iso));
export const fmtDate = (iso: string) => d.format(new Date(iso));
