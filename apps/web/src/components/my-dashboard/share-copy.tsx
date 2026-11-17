"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { notify } from "@/lib/notify";
import type { ShareInfo } from "@/server/my-templates";
import { QrButton } from "./qr-dialog";

/**
 * Copies the public link of one thing (all templates, a category, a tag, a template) to the clipboard: this site's address and the
 * link's path. When the Client has switched the link off the address is still copied, with a note that it shows nothing yet.
 */
export function ShareCopy({ share, label, className = "", compact = true }: { share: ShareInfo | undefined; label: string; className?: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  if (!share) return null;
  const copy = async () => {
    const url = `${window.location.origin}${share.path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      notify.error("The link could not be copied.", { description: url });
      return;
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
    if (share.active) notify.success("Share link copied.", { id: "share-copied" });
    else notify.warning("Link copied, but it is switched off.", { id: "share-copied", description: "Turn it on in the Share tab so people can open it." });
  };
  const Icon = done ? Check : Link2;
  return (
    <>
      <button type="button" onClick={() => void copy()} title={`Copy share link${share.active ? "" : " (switched off)"}`} aria-label={`Copy share link: ${label}`} className={className || (compact ? "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" : "")}>
        <Icon className={`size-3.5 ${share.active ? "" : "opacity-50"}`} aria-hidden />
      </button>
      <QrButton path={share.path} label={label} active={share.active} className={className} />
    </>
  );
}
