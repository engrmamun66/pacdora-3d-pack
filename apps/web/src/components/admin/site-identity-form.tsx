"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { saveSiteTitle, type IdentityFormState } from "@/app/doraadmin/actions";
import { SITE_TITLE_MAX, type IdentityFile } from "@/lib/site-identity";

/** Upload / replace / remove one image (logo or favicon). Sends the file to the identity API, then refreshes the page data. */
function ImageField({ kind, legend, hint, accept, currentUrl, previewClass }: { kind: IdentityFile; legend: string; hint: string; accept: string; currentUrl: string | null; previewClass: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const hintId = `identity-${kind}-hint`;

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file);
      const res = await fetch("/api/doraadmin/site-identity", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        notify.error(data.error ?? "Upload failed.", { id: `identity-${kind}` });
        return;
      }
      setUrl(data.url);
      notify.success(`${legend} saved.`, { id: `identity-${kind}` });
      router.refresh();
    } catch {
      notify.error("Upload failed. Check your connection and try again.", { id: `identity-${kind}` });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/doraadmin/site-identity?kind=${kind}`, { method: "DELETE" });
      if (!res.ok) {
        notify.error("Could not remove it.", { id: `identity-${kind}` });
        return;
      }
      setUrl(null);
      notify.success(`${legend} removed. The default is used again.`, { id: `identity-${kind}` });
      router.refresh();
    } catch {
      notify.error("Could not remove it.", { id: `identity-${kind}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId} disabled={busy}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex items-center gap-4">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40 ${previewClass}`}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small admin preview of a stored file
            <img src={url} alt={`Current ${legend.toLowerCase()}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-1 text-center text-xs text-muted-foreground">Default</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept={accept} className="sr-only" id={`identity-${kind}-file`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button type="button" variant="outline" className="h-10" onClick={() => input.current?.click()}>{busy ? "Working…" : url ? "Replace" : "Upload"}</Button>
          {url ? <Button type="button" variant="ghost" className="h-10" onClick={remove}>Remove</Button> : null}
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  );
}

/** Site title, logo and favicon. The title is a normal form; the two images upload as soon as a file is chosen. */
export function SiteIdentityForm({ initialTitle, defaultTitle, logoUrl, faviconUrl }: { initialTitle: string; defaultTitle: string; logoUrl: string | null; faviconUrl: string | null }) {
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(saveSiteTitle, { ok: false, message: null });
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) notify.success(state.message, { id: "identity-save" });
    else notify.error(state.message, { id: "identity-save" });
  }, [state]);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form action={action} className="flex flex-col gap-2">
        <label htmlFor="identity-title" className="text-sm font-medium">Site title</label>
        <div className="flex items-center gap-3">
          <input
            id="identity-title"
            name="title"
            defaultValue={initialTitle}
            maxLength={SITE_TITLE_MAX}
            placeholder={defaultTitle}
            aria-describedby="identity-title-hint"
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" className="h-10" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
        <p id="identity-title-hint" className="text-xs text-muted-foreground">
          Shown next to the logo, in the browser tab and in emails. Leave empty to use the default name ({defaultTitle}). Up to {SITE_TITLE_MAX} characters.
        </p>
        {state.message && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      </form>

      <ImageField
        kind="logo"
        legend="Logo"
        hint="PNG or JPEG, up to 2 MB. Shown at about 28 px tall in the site header, so a wide or square image with a transparent background works best. Without a logo the default mark is used."
        accept="image/png,image/jpeg"
        currentUrl={logoUrl}
        previewClass="h-16 w-32"
      />

      <ImageField
        kind="favicon"
        legend="Favicon"
        hint="The small icon in the browser tab. Square PNG or JPEG, at least 32 × 32 pixels, up to 512 KB. Without one the default icon is used."
        accept="image/png,image/jpeg"
        currentUrl={faviconUrl}
        previewClass="size-16"
      />
    </div>
  );
}
