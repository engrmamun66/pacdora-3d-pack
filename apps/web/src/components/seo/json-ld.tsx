import { jsonLdText } from "@/lib/structured-data";

/** Structured data for search engines, in a <script>. The text is escaped so it can never close the tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
