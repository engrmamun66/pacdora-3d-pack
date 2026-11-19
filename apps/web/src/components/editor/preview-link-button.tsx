"use client";

import { useState } from "react";
import { Check, ExternalLink, Link2 } from "lucide-react";
import { notify } from "@/lib/notify";

/**
 * "Link": copies the address of this template on the Client's shared pages (the 3D preview customers see). When the link is switched
 * off the address is still copied, with a note that it shows nothing yet.
 */
export function PreviewLinkButton({ path, active }: { path: string; active: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      notify.error("The link could not be copied.", { description: url });
      return;
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
    if (active) notify.success("Preview link copied.", { id: "preview-link" });
    else notify.warning("Link copied, but it is switched off.", { id: "preview-link", description: "Turn it on in My dashboard > Share so people can open it." });
  };
  const Icon = done ? Check : Link2;
  return (
    <button type="button" onClick={() => void copy()} title="Copy preview link" aria-label="Copy preview link" className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Icon className={`size-3.5 ${active ? "" : "opacity-50"}`} aria-hidden /> Link
    </button>
  );
}

/** "Open": the same address in a new tab, to see the page the way customers do. */
export function PreviewOpenButton({ path, active }: { path: string; active: boolean }) {
  return (
    <a href={path} target="_blank" rel="noopener noreferrer" title={active ? "Open the preview page in a new tab" : "Open the preview page (the link is switched off, so it shows nothing yet)"} className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <ExternalLink className={`size-3.5 ${active ? "" : "opacity-50"}`} aria-hidden /> Open
    </a>
  );
}
