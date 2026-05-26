/**
 * Manual task playbooks — English, operational steps.
 *
 * Each playbook is a deterministic checklist that the Execution Task Engine
 * (next sprint) will hydrate into concrete tasks. Until then they show up in
 * the masterplan UI as collapsible steps under each manual item.
 */

export const TRACKING_PLAYBOOK = [
  "Confirm the primary business phone number used in ads, GBP and website.",
  "List every contact form on the site (request a quote, contact, service call).",
  "Verify whether calls are tracked today (provider, recording, source attribution).",
  "Verify whether form submits fire a tracked event with source attribution.",
  "Define which source fields are stored per lead (campaign, page, channel).",
  "Plan how tracked leads land in the operator's inbox / CRM.",
  "Mark done once every incoming lead can be attributed to a source.",
];

export const GBP_PLAYBOOK = [
  "Confirm Google Business Profile ownership and access.",
  "Verify NAP (name, address, phone) matches the website and citations exactly.",
  "Check the primary category and adjust to the highest-intent service category.",
  "Review service categories and add missing target services.",
  "Check the listed services and align them with target services and locations.",
  "Audit photo set — exterior, team, branded vehicles, completed jobs.",
  "Review review count, rating, and unanswered reviews.",
  "Link relevant service / location pages from the profile.",
  "Note proof gaps (license number, certifications, guarantees) to add elsewhere.",
];

export const REVIEW_PLAYBOOK = [
  "Confirm where reviews are collected today (Google, Yelp, industry platform).",
  "Identify the best moment to ask (job completion, invoice paid, follow-up call).",
  "Draft a short review request message for SMS and email.",
  "Define follow-up timing for non-responders (one reminder, then stop).",
  "Track who was asked and who responded — sheet or CRM field is fine for V1.",
  "Mark done once the request is a standard part of job closeout.",
];

export const REPORTING_PLAYBOOK = [
  "Define the monthly lead KPI (qualified leads per month).",
  "Track calls and form submits per source.",
  "Track which masterplan items were completed in the month.",
  "Report leads, qualified leads, and progress vs the growth goal.",
  "List next month's priorities and any blockers.",
];

export const CONVERSION_PLAYBOOK = [
  "Audit the primary CTA copy and placement on top service pages.",
  "Verify click-to-call works on mobile for every service page.",
  "Verify form submit success and any auto-reply email or SMS.",
  "Check lead capture friction (required fields, validation, error states).",
  "Confirm there is a clear next step after submission (thank-you page, expected response time).",
];
