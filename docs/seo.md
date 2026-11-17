# SEO

Search-engine data of the public site is edited under **Admin > Settings > SEO** (stored as site setting `seo`, schema in `apps/web/src/lib/seo-settings.ts`, built-in data in `DEFAULT_SEO`). The words of the home page are under **Admin > Pages**.

## What the site sends to search engines

- **Head data** (root layout, `generateMetadata`): title and its pattern, description, keywords, canonical address, robots switch, Open Graph and Twitter cards, Google / Bing ownership codes. A page sets its own title and description through `server/seo-meta.ts` (`pageMetadata`, `templateMetadata`).
- **Link preview picture**: drawn by `app/opengraph-image.tsx` and `app/twitter-image.tsx` (`lib/og-card.tsx`) unless Settings > SEO names a picture. A client's shared shop link shows the client's own name and logo.
- **Structured data** (JSON-LD, `lib/structured-data.ts`): Organization, WebSite, SoftwareApplication (with a free offer when "free to use" is on) and FAQPage on the home page; BreadcrumbList and ItemList on the dieline pages. No ratings or reviews are made up.
- **Public, crawlable pages**: `/` , `/dielines` (all templates, grouped by use) and `/dielines/{template}` (one page per published template, with its own title, description, breadcrumbs and links to related templates). The editor and the template library need a sign-in and are not indexed.
- **`/sitemap.xml`** lists those pages; **`/robots.txt`** closes the signed-in areas and the API, and points to the sitemap. Switching "Let search engines list this site" off closes the whole site.

## Market notes (looked at 17 Nov 2026)

- The incumbent online packaging tool (Pacdora) is a large template and mockup library: thousands of dielines, mockup categories, AI tools; full Open Graph / Twitter tags, canonical, language alternates and structured data (software application with offers and a rating), and a sitemap index. Its detail pages are blocked in robots.txt and its sitemap dates are old, and it has little written help content.
- Other searched names: free dieline generator pages per box type (GoVisually, Newprint, QinPrinting, Packhelp's toolbox), DielineKit (parametric), Die Cut Templates, Pack.ly, Esko Studio (professional), Canva and Vectary (general).
- People search for: "dieline generator", "box template", "custom box dieline", "packaging design software", "3D box mockup", box styles by name (tuck end, crash lock, mailer, RSC), and file types (DXF, PDF, AI).
- This site's difference is that every dieline is calculated from the buyer's own size, folds in 3D and exports with cut / crease layers, so the built-in text leads with that, and each template has its own public page (the long-tail box-style searches).

## Next steps that help ranking

1. Verify the site in Google Search Console and Bing Webmaster Tools (codes in Settings > SEO) and submit `/sitemap.xml`.
2. Set the real production address in `BETTER_AUTH_URL` (the sitemap, canonical and preview addresses are built from it).
3. Write a short description for every template (it is the page's text) and give each a clear name with the box style in it.
4. Add help articles for questions people search ("what is a dieline", "how to measure a box"): a section the home page and sitemap can grow into.
