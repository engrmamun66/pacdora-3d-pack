import { ENGINE_VERSION } from "@packaging/dieline-engine";
import { Badge, Row, SettingsHeading } from "@/components/admin/settings-ui";
import { db } from "@/server/db";
import { env, aiEnabled, googleEnabled } from "@/server/env";
import { LIMITS } from "@/server/limits";
import { requireSuperAdmin } from "@/server/admin";

export const metadata = { title: "Settings: System status" };

const isTestKey = (k: string) => /^[123]x0{20,}/.test(k);

/** Read-only system status. Never shows secrets. */
export default async function SystemSettings() {
  await requireSuperAdmin();
  const dbOk = await db.$queryRaw`select 1`.then(() => true, () => false);
  const admins = await db.user.count({ where: { role: "superadmin" } });
  const host = new URL(env.BETTER_AUTH_URL).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const testKeys = isTestKey(env.TURNSTILE_SECRET_KEY);

  return (
    <section aria-labelledby="h-system">
      <SettingsHeading title="System status" description="These values come from the server environment and can only be changed there." />
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
    </section>
  );
}
