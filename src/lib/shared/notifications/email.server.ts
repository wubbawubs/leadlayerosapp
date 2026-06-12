/**
 * Email utility — server-only.
 *
 * Uses Resend for transactional email.
 * Requires RESEND_API_KEY environment variable.
 * Requires RESEND_FROM_EMAIL environment variable (e.g. "LeadLayer <noreply@yourdomain.com>").
 *
 * All sends are best-effort — callers must NOT await this for anything
 * that would block the main flow (e.g. lead ingestion).
 *
 * If RESEND_API_KEY is not configured, logs a warning and returns { ok: false }.
 * Never throws — email failure must never crash the application.
 */
import { Resend } from "resend";

export interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "LeadLayer <noreply@leadlayer.app>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured — email skipped");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data?.id };
  } catch (e) {
    console.error("[email] sendEmail threw:", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

// ------------------------------------------------------------------
// Email templates
// ------------------------------------------------------------------

type EmailLocale = "nl" | "en";

const LEAD_EMAIL_COPY = {
  nl: {
    subject: (b: string) => `Nieuwe lead — ${b}`,
    heading: (b: string) => `Nieuwe lead — ${b}`,
    receivedVia: (src: string, date: string) =>
      `Binnengekomen via <strong>${src}</strong> · ${date}`,
    name: "Naam",
    phone: "Telefoon",
    email: "E-mail",
    message: "Bericht",
    source: "Bron",
    cta: "Bekijk in je dashboard →",
    footer: (b: string) => `Je ontvangt dit omdat lead-meldingen aanstaan voor ${b}.`,
    unknown: "Onbekend",
    intl: "nl-NL",
  },
  en: {
    subject: (b: string) => `New lead — ${b}`,
    heading: (b: string) => `New lead — ${b}`,
    receivedVia: (src: string, date: string) => `Received via <strong>${src}</strong> · ${date}`,
    name: "Name",
    phone: "Phone",
    email: "Email",
    message: "Message",
    source: "Source",
    cta: "View in your dashboard →",
    footer: (b: string) => `You received this because lead notifications are enabled for ${b}.`,
    unknown: "Unknown",
    intl: "en-GB",
  },
} as const;

export function buildLeadNotificationEmail(opts: {
  businessName: string;
  source: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  receivedAt: string;
  appUrl: string;
  locale?: EmailLocale;
}): { subject: string; html: string; text: string } {
  const { businessName, source, name, phone, email, message, receivedAt, appUrl } = opts;
  const t = LEAD_EMAIL_COPY[opts.locale ?? "en"];
  const displayName = name ?? t.unknown;
  const date = new Date(receivedAt).toLocaleString(t.intl, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = t.subject(businessName);

  const row = (label: string, value: string) =>
    `<tr><td style="padding: 8px 0; border-top: 1px solid #DDD4C2; color: #5A554E; width: 100px;">${label}</td><td style="padding: 8px 0; border-top: 1px solid #DDD4C2; color: #1A1A1C;">${value}</td></tr>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #F5F0E8; color: #1A1A1C;">
  <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8C8884; margin-bottom: 4px; font-family: monospace;">LeadLayer</p>
  <h1 style="font-size: 20px; margin: 0 0 8px;">${t.heading(businessName)}</h1>
  <p style="color: #5A554E; margin: 0 0 20px; font-size: 14px;">${t.receivedVia(source, date)}</p>

  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    ${row(t.name, displayName)}
    ${phone ? row(t.phone, `<a href="tel:${phone}" style="color: #B45309; font-weight: 600;">${phone}</a>`) : ""}
    ${email ? row(t.email, `<a href="mailto:${email}" style="color: #B45309;">${email}</a>`) : ""}
    ${message ? row(t.message, message) : ""}
    ${row(t.source, source)}
  </table>

  <div style="margin-top: 28px;">
    <a href="${appUrl}" style="display: inline-block; background: #2D2D2D; color: #F5F0E8; padding: 12px 22px; border-radius: 4px; text-decoration: none; font-size: 14px; font-weight: 600;">
      ${t.cta}
    </a>
  </div>

  <p style="margin-top: 32px; font-size: 12px; color: #8C8884;">
    ${t.footer(businessName)}
  </p>
</body>
</html>`;

  const text = `${subject}

${t.source}: ${source}
${date}

${name ? `${t.name}: ${name}\n` : ""}${phone ? `${t.phone}: ${phone}\n` : ""}${email ? `${t.email}: ${email}\n` : ""}${message ? `${t.message}: ${message}\n` : ""}
${appUrl}
`;

  return { subject, html, text };
}

const INVITE_EMAIL_COPY = {
  nl: {
    subject: (b: string) => `Je groeidashboard voor ${b} staat klaar`,
    heading: "Je dashboard staat klaar",
    body: (b: string) =>
      `Vanaf nu zie je precies wat er voor ${b} gebeurt: elke lead, elke nieuwe pagina en wat het oplevert. Stel eenmalig een wachtwoord in en je bent binnen.`,
    cta: "Wachtwoord instellen →",
    expires:
      "Deze link is 24 uur geldig. Daarna kun je een nieuwe aanvragen via \u201cWachtwoord vergeten\u201d.",
    footer: "Je ontvangt deze uitnodiging van je LeadLayer-team.",
  },
  en: {
    subject: (b: string) => `Your growth dashboard for ${b} is ready`,
    heading: "Your dashboard is ready",
    body: (b: string) =>
      `From now on you can see exactly what's happening for ${b}: every lead, every new page, and what it's worth. Set a password once and you're in.`,
    cta: "Set your password →",
    expires:
      "This link is valid for 24 hours. After that, request a new one via \u201cForgot password\u201d.",
    footer: "You're receiving this invitation from your LeadLayer team.",
  },
} as const;

export function buildClientInviteEmail(opts: {
  businessName: string;
  inviteUrl: string;
  locale?: EmailLocale;
}): { subject: string; html: string; text: string } {
  const t = INVITE_EMAIL_COPY[opts.locale ?? "en"];
  const subject = t.subject(opts.businessName);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #F5F0E8; color: #1A1A1C;">
  <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8C8884; margin-bottom: 4px; font-family: monospace;">LeadLayer</p>
  <h1 style="font-size: 22px; margin: 0 0 12px;">${t.heading}</h1>
  <p style="color: #5A554E; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">${t.body(opts.businessName)}</p>

  <a href="${opts.inviteUrl}" style="display: inline-block; background: #2D2D2D; color: #F5F0E8; padding: 14px 26px; border-radius: 4px; text-decoration: none; font-size: 15px; font-weight: 600;">
    ${t.cta}
  </a>

  <p style="margin-top: 24px; font-size: 13px; color: #8C8884;">${t.expires}</p>
  <p style="margin-top: 32px; font-size: 12px; color: #8C8884; border-top: 1px solid #DDD4C2; padding-top: 16px;">${t.footer}</p>
</body>
</html>`;

  const text = `${subject}

${t.body(opts.businessName).replace(/<[^>]+>/g, "")}

${t.cta.replace(" →", "")}: ${opts.inviteUrl}

${t.expires}
`;

  return { subject, html, text };
}

export function buildReportEmail(opts: {
  businessName: string;
  periodLabel: string;
  leadCount: number;
  revenue: number;
  pagesLive: number;
  pagesOptimized: number;
  shareUrl: string;
}): { subject: string; html: string; text: string } {
  const { businessName, periodLabel, leadCount, revenue, pagesLive, pagesOptimized, shareUrl } =
    opts;

  const subject = `Your ${periodLabel} progress report — ${businessName}`;

  const highlights = [
    `${leadCount} lead${leadCount !== 1 ? "s" : ""} this period`,
    revenue > 0 ? `€${revenue.toLocaleString()} revenue tracked` : null,
    pagesLive > 0 ? `${pagesLive} page${pagesLive !== 1 ? "s" : ""} live` : null,
    pagesOptimized > 0
      ? `${pagesOptimized} existing page${pagesOptimized !== 1 ? "s" : ""} improved`
      : null,
  ].filter(Boolean);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 4px;">LeadLayer</p>
  <h1 style="font-size: 20px; margin: 0 0 8px;">Your ${periodLabel} report is ready</h1>
  <p style="color: #666; margin: 0 0 20px; font-size: 14px;">${businessName}</p>

  <ul style="padding-left: 0; list-style: none; font-size: 15px; margin: 0 0 28px;">
    ${highlights.map((h) => `<li style="padding: 6px 0; border-bottom: 1px solid #eee;">✓ ${h}</li>`).join("\n")}
  </ul>

  <a href="${shareUrl}" style="display: inline-block; background: #E8913A; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
    View your full report →
  </a>

  <p style="margin-top: 24px; font-size: 12px; color: #aaa;">
    This link is read-only and does not require a login.
  </p>
</body>
</html>`;

  const text = `Your ${periodLabel} report is ready — ${businessName}

${highlights.join("\n")}

View your full report: ${shareUrl}
`;

  return { subject, html, text };
}
