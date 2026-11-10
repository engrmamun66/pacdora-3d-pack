import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";
import { getSiteTitle } from "./site-identity";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Send a simple transactional email with one call-to-action link. */
export async function sendActionEmail(opts: { to: string; subject: string; intro: string; actionLabel: string; url: string }) {
  const { to, subject, intro, actionLabel, url } = opts;
  const siteTitle = await getSiteTitle();
  await transport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject: `${subject} - ${siteTitle}`,
    text: `${intro}\n\n${actionLabel}: ${url}\n\nIf you did not request this, you can ignore this email.`,
    html:
      `<p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(url)}">${escapeHtml(actionLabel)}</a></p>` +
      `<p style="color:#666">If you did not request this, you can ignore this email.</p>`,
  });
}
