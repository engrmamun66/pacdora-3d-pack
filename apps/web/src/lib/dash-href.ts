export interface DashFilter {
  q: string;
  cat: string;
  tag: string;
}

/** Address of the customer dashboard with this filter (empty parts are left out). */
export const dashHref = (f: DashFilter) => {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.cat) p.set("cat", f.cat);
  if (f.tag) p.set("tag", f.tag);
  const s = p.toString();
  return s ? `/my-dashboard?${s}` : "/my-dashboard";
};
