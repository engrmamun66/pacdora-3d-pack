"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Printer, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { notify } from "@/lib/notify";
import { useBrand } from "./brand-context";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Made {
  svg: string;
  png: string;
}

async function makeQr(url: string): Promise<Made> {
  const [svg, png] = await Promise.all([
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    QRCode.toDataURL(url, { margin: 2, width: 1024, errorCorrectionLevel: "M" }),
  ]);
  return { svg, png };
}

/** A clean page with the logo, the name, what the code opens, a big code and the address. Printed through a hidden frame (no pop-up to block). */
function printSheet(opts: { brandName: string; logo: string | null; label: string; url: string; png: string }) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  const logo = opts.logo ? `<img class="logo" src="${esc(new URL(opts.logo, window.location.origin).href)}" alt="">` : "";
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.label)} - QR code</title><style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; text-align: center; }
    .logo { display: block; margin: 0 auto 6mm; max-height: 30mm; max-width: 80mm; object-fit: contain; }
    h1 { margin: 0 0 2mm; font-size: 26pt; }
    h2 { margin: 0 0 8mm; font-size: 16pt; font-weight: 500; color: #333; }
    .qr { display: block; margin: 0 auto 8mm; width: 110mm; height: 110mm; }
    p { margin: 0 0 3mm; font-size: 14pt; }
    .url { font-size: 11pt; color: #444; word-break: break-all; }
  </style></head><body>${logo}${opts.brandName ? `<h1>${esc(opts.brandName)}</h1>` : ""}<h2>${esc(opts.label)}</h2><img class="qr" src="${opts.png}" alt="QR code"><p>Scan with your phone camera to open</p><p class="url">${esc(opts.url)}</p></body></html>`;
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    const imgs = Array.from(w.document.images);
    const ready = Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = () => r(null); }))));
    // Wait for the pictures, then print; remove the frame afterwards (a long delay: some browsers print asynchronously).
    void ready.then(() => {
      w.focus();
      w.print();
      window.setTimeout(() => frame.remove(), 60_000);
    });
  };
  document.body.appendChild(frame);
}

/**
 * A QR code for one share link: shown in a window that can print it (with the Client's logo and business name),
 * download it as a picture, or copy the link. Works for every link, also one that is switched off (with a note).
 */
export function QrButton({ path, label, active = true, className = "", withText = false }: { path: string; label: string; active?: boolean; className?: string; withText?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const brand = useBrand();
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState<Made | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const open = () => {
    const full = `${window.location.origin}${path}`;
    setUrl(full);
    setError(false);
    setQr(null);
    dialog.current?.showModal();
    makeQr(full).then(setQr).catch(() => setError(true));
  };
  useEffect(() => {
    const d = dialog.current;
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d?.close();
    };
    d?.addEventListener("click", onClick);
    return () => d?.removeEventListener("click", onClick);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      notify.error("The link could not be copied.", { description: url });
    }
  };
  const file = `qr-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "link"}.png`;
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={open}
        title={`QR code${active ? "" : " (link switched off)"}`}
        aria-label={`QR code: ${label}`}
        className={className || (withText ? "inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" : "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring")}
      >
        <QrCode className={`size-3.5 ${active ? "" : "opacity-50"}`} aria-hidden />
        {withText ? "QR code" : null}
      </button>
      <dialog ref={dialog} aria-label={`QR code for ${label}`} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">QR code</h2>
              <p className="truncate text-sm text-muted-foreground">{label}</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted"><X className="size-4" aria-hidden /></button>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-black">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the Client's own logo
              <img src={brand.logoUrl} alt="" className="max-h-12 max-w-40 object-contain" />
            ) : null}
            {brand.name ? <p className="font-semibold">{brand.name}</p> : null}
            {qr ? <div role="img" aria-label={`QR code of ${url}`} className="size-52 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.svg }} /> : <div className="grid size-52 place-items-center text-sm text-neutral-500">{error ? "The code could not be made." : "Making the code…"}</div>}
            <p className="max-w-full text-center text-xs break-all text-neutral-600">{url}</p>
          </div>
          {!active ? <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">This link is switched off, so the code shows nothing yet. Turn it on in the Share tab before you print it.</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={!qr} onClick={() => qr && printSheet({ brandName: brand.name, logo: brand.logoUrl, label, url, png: qr.png })}><Printer className="size-4" aria-hidden /> Print</button>
            {qr ? (
              <a href={qr.png} download={file} className={btn}><Download className="size-4" aria-hidden /> Download</a>
            ) : (
              <span className={`${btn} pointer-events-none opacity-50`}><Download className="size-4" aria-hidden /> Download</span>
            )}
            <button type="button" className={btn} onClick={() => void copy()}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
