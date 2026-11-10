import { getSiteIdentity } from "@/server/site-identity";

/** The site title as text (footer, headings). Set under Settings > Site Identity. */
export async function SiteTitle() {
  return (await getSiteIdentity()).title;
}

/**
 * Logo and title side by side. Without an uploaded logo the built-in box mark is shown.
 * `size` is the mark's box in rem-ish Tailwind units; an uploaded logo is height-limited to the same.
 */
export async function SiteBrand({ size = "md" }: { size?: "md" | "lg" }) {
  const { title, logoUrl } = await getSiteIdentity();
  const box = size === "lg" ? "size-8" : "size-7";
  const img = size === "lg" ? "h-8" : "h-7";
  return (
    <>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored, admin-uploaded file served by our own route
        <img src={logoUrl} alt="" className={`${img} w-auto max-w-40 shrink-0 object-contain`} />
      ) : (
        <span aria-hidden className={`grid ${box} shrink-0 place-items-center rounded-md bg-primary text-primary-foreground`}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
        </span>
      )}
      <span>{title}</span>
    </>
  );
}
