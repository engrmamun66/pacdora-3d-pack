/** The tabs of the dieline page and the `?view=` query value that remembers the chosen one across a reload. */
export const VIEW_TABS = ["dieline", "3d", "split"] as const;
export type ViewTab = (typeof VIEW_TABS)[number];

export const VIEW_PARAM = "view";

/** The tab named by a query value; anything unknown (or missing) is the Dieline tab. */
export function readViewTab(raw: string | string[] | undefined | null): ViewTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VIEW_TABS.find((t) => t === v) ?? "dieline";
}

/** `href` with the tab written into (or, for Dieline, removed from) its query. */
export function withViewTab(href: string, tab: ViewTab): string {
  const url = new URL(href);
  if (tab === "dieline") url.searchParams.delete(VIEW_PARAM);
  else url.searchParams.set(VIEW_PARAM, tab);
  return url.toString();
}
