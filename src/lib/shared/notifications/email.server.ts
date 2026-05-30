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

export function buildLeadNotificationEmail(opts: {
  businessName: string;
  source: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  receivedAt: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { businessName, source, name, phone, email, message, receivedAt, appUrl } = opts;
  const displayName = name ?? "Unknown";
  const date = new Date(receivedAt).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const subject = `New lead — ${businessName}`;

  const contactLines = [
    name ? `<li><strong>Name:</strong> ${name}</li>` : "",
    phone ? `<li><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></li>` : "",
    email ? `<li><strong>Email:</strong> <a href="mailto:${email}">${email}</a></li>` : "",
    message ? `<li><strong>Message:</strong> ${message}</li>` : "",
  ].filter(Boolean).join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 4px;">LeadLayer</p>
  <h1 style="font-size: 20px; margin: 0 0 8px;">New lead — ${businessName}</h1>
  <p style="color: #666; margin: 0 0 20px; font-size: 14px;">Received via <strong>${source}</strong> · ${date}</p>

  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr>
      <td style="padding: 8px 0; border-top: 1px solid #eee; color: #666; width: 100px;">Name</td>
      <td style="padding: 8px 0; border-top: 1px solid #eee;">${displayName}</td>
    </tr>
    ${phone ? `<tr><td style="padding: 8px 0; border-top: 1px solid #eee; color: #666;">Phone</td><td style="padding: 8px 0; border-top: 1px solid #eee;"><a href="tel:${phone}" style="color: #4f46e5;">${phone}</a></td></tr>` : ""}
    ${email ? `<tr><td style="padding: 8px 0; border-top: 1px solid #eee; color: #666;">Email</td><td style="padding: 8px 0; border-top: 1px solid #eee;"><a href="mailto:${email}" style="color: #4f46e5;">${email}</a></td></tr>` : ""}
    ${message ? `<tr><td style="padding: 8px 0; border-top: 1px solid #eee; color: #666;">Message</td><td style="padding: 8px 0; border-top: 1px solid #eee;">${message}</td></tr>` : ""}
    <tr>
      <td style="padding: 8px 0; border-top: 1px solid #eee; color: #666;">Source</td>
      <td style="padding: 8px 0; border-top: 1px solid #eee;">${source}</td>
    </tr>
  </table>

  <div style="margin-top: 28px;">
    <a href="${appUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
      View in LeadLayer →
    </a>
  </div>

  <p style="margin-top: 32px; font-size: 12px; color: #aaa;">
    You received this because lead notifications are enabled for ${businessName}.<br>
    Manage notification settings in LeadLayer.
  </p>
</body>
</html>`;

  const text = `New lead — ${businessName}

Source: ${source}
Received: ${date}

${name ? `Name: ${name}\n` : ""}${phone ? `Phone: ${phone}\n` : ""}${email ? `Email: ${email}\n` : ""}${message ? `Message: ${message}\n` : ""}
View in LeadLayer: ${appUrl}
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
  const { businessName, periodLabel, leadCount, revenue, pagesLive, pagesOptimized, shareUrl } = opts;

  const subject = `Your ${periodLabel} progress report — ${businessName}`;

  const highlights = [
    `${leadCount} lead${leadCount !== 1 ? "s" : ""} this period`,
    revenue > 0 ? `€${revenue.toLocaleString()} revenue tracked` : null,
    pagesLive > 0 ? `${pagesLive} page${pagesLive !== 1 ? "s" : ""} live` : null,
    pagesOptimized > 0 ? `${pagesOptimized} existing page${pagesOptimized !== 1 ? "s" : ""} improved` : null,
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

  <a href="${shareUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
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
