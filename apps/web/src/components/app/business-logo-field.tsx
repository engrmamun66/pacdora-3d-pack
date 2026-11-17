"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * The Client's business logo for their shared pages: upload (PNG or JPEG, 2 MB), remove, and a small preview of how the
 * top bar of the shared page looks with it. The business name next to it is the one in the form below.
 */
export function BusinessLogoField({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) return notify.error("The logo is larger than 2 MB.", { id: "logo" });
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/profile/logo", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) notify.error(json.error ?? "The logo could not be saved.", { id: "logo" });
      else {
        notify.success("Logo saved.", { id: "logo" });
        router.refresh();
      }
    } catch {
      notify.error("The logo could not be saved. Check your connection and try again.", { id: "logo" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/logo", { method: "DELETE" });
      if (!res.ok) notify.error("The logo could not be removed.", { id: "logo" });
      else {
        notify.success("Logo removed.", { id: "logo" });
        router.refresh();
      }
    } catch {
      notify.error("The logo could not be removed.", { id: "logo" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/40">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the Client's own logo
            <img src={logoUrl} alt="Your business logo" className="size-full object-contain p-1.5" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{logoUrl ? "Change logo" : "Upload logo"}</Button>
            {logoUrl ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}><Trash2 className="size-4" aria-hidden /> Remove</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">PNG or JPEG, 2 MB at most. A square or wide logo on a plain background works best.</p>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Business logo file" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </div>
      <div aria-label="Preview of your shared page header" className="flex h-14 max-w-md items-center gap-2 rounded-lg border bg-background px-4 shadow-xs">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the Client's own logo
          <img src={logoUrl} alt="" className="h-8 max-w-28 shrink-0 object-contain" />
        ) : (
          <Package className="size-5 shrink-0" aria-hidden />
        )}
        <span className="truncate font-semibold">{name}</span>
        <span className="ml-auto rounded-md bg-muted px-2.5 py-1 text-sm">Templates</span>
      </div>
    </div>
  );
}
