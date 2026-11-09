import type { ReactNode } from "react";
import { ENGINE_VERSION } from "@packaging/dieline-engine";
import { HeroSettingsForm } from "@/components/admin/hero-settings-form";
import { db } from "@/server/db";
import { readHeroSettings } from "@/server/site-settings";
import { env, aiEnabled, googleEnabled } from "@/server/env";
import { LIMITS } from "@/server/limits";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Settings" };

const isTestKey = (k: string) => /^[123]x0{20,}/.test(k);

function Row({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-56 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">
        {children}
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </dd>
    </div>
  );
}

const Badge = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{ok ? yes : no}</span>
);

/** Read-only system status. Never shows secrets. */
export default async function AdminSettings() {
  await requireSuperAdmin();
  const hero = await readHeroSettings();
  const dbOk = await db.$queryRaw`select 1`.then(() => true, () => false);
  const admins = await db.user.count({ where: { role: "superadmin" } });
  const host = new URL(env.BETTER_AUTH_URL).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const testKeys = isTestKey(env.TURNSTILE_SECRET_KEY);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Site options and the state of this installation. Your own account is under Profile (top right).</p>
      </div>

      <section aria-labelledby="h-home" className="flex flex-col gap-4">
        <div>
          <h2 id="h-home" className="font-medium">Home page</h2>
          <p className="text-sm text-muted-foreground">
            Hero section{hero.updatedAt ? `. Last saved ${hero.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}.
          </p>
        </div>
        <HeroSettingsForm initial={hero.settings} />
      </section>

      <section aria-labelledby="h-system" className="flex flex-col gap-3">
        <h2 id="h-system" className="font-medium">System status</h2>
        <dl className="max-w-3xl rounded-xl border px-4">
          <Row label="Database"><Badge ok={dbOk} yes="Connected" no="Not reachable" /></Row>
          <Row label="App URL">{env.BETTER_AUTH_URL}</Row>
          <Row label="Environment">{process.env.NODE_ENV}{local ? " (local)" : ""}</Row>
          <Row label="Dieline engine">{ENGINE_VERSION}</Row>
          <Row label="Super admins">{admins}</Row>
          <Row label="Google sign-in"><Badge ok={googleEnabled} yes="Enabled" no="Off" /></Row>
          <Row label="Human verification" note={testKeys ? "Cloudflare test keys always pass. Use real keys before going public." : undefined}>
            <Badge ok={!testKeys} yes="Real keys" no="Test keys" />
          </Row>
          <Row label="Email server">{env.SMTP_HOST}:{env.SMTP_PORT} from {env.MAIL_FROM}</Row>
          <Row label="AI box suggestions" note={aiEnabled ? `${env.AI_DAILY_LIMIT} requests per user per 24 hours.` : "Set ANTHROPIC_API_KEY to turn it on."}>
            <Badge ok={aiEnabled} yes="Enabled" no="Off" />
          </Row>
          <Row label="Client IP header" note="Rate limits use this header. Your proxy must overwrite it.">{env.CLIENT_IP_HEADER}</Row>
          <Row label="Upload storage">{env.STORAGE_DIR ?? "./storage (default)"}</Row>
          <Row label="Rate limits (per user)">
            exports {LIMITS.export.max}/min, uploads {LIMITS.upload.max}/min, artwork saves {LIMITS.saveArtwork.max}/min
          </Row>
        </dl>
        <p className="text-xs text-muted-foreground">These values come from the server environment and can only be changed there.</p>
      </section>
    </div>
  );
}
