/**
 * Client portal copy — NL + EN.
 *
 * The portal speaks the client's language (tenant.geo: NL → nl, US → en).
 * Voice: a sharp local agency talking to a busy tradesperson. Short,
 * concrete, zero software jargon. Dutch uses informal "je".
 */

export type PortalLocale = "nl" | "en";

const nl = {
  // Shell
  tabs: { home: "Start", leads: "Leads", pages: "Pagina's", reports: "Rapporten" },
  signOut: "Uitloggen",
  poweredBy: "Aangedreven door LeadLayer",

  // Greeting
  greetingMorning: "Goedemorgen",
  greetingAfternoon: "Goedemiddag",
  greetingEvening: "Goedenavond",

  // Home hero
  thisMonthsGoal: "Doel deze maand",
  goalOf: (actual: number, target: number) => `${actual} van ${target}`,
  leadsWord: "leads",
  statusAhead: "Je ligt voor op schema",
  statusOnTrack: "Je ligt op schema",
  statusBehind: "Nog niet op schema — wij zitten erbovenop",
  statusComplete: "Doel gehaald",
  statusProgress: "In volle gang",
  daysLeft: (d: number) => `nog ${d} ${d === 1 ? "dag" : "dagen"}`,

  // Stats
  statLeadsMonth: "Leads deze maand",
  statRevenue: "Gewonnen omzet",
  statPagesLive: "Pagina's live",
  vsLastMonth: (m: string) => `t.o.v. ${m}`,

  // Dashboard analytics
  analytics: {
    last30: "Laatste 30 dagen",
    visitors: "Bezoekers",
    pageviews: "Paginaweergaven",
    conversions: "Conversies",
    conversionRate: "Conversieratio",
    trafficTrend: "Verkeer & conversies",
    ctaPerformance: "CTA-prestaties",
    ctaSub: "Hoe elke call-to-action presteert",
    impressions: "Vertoningen",
    clicks: "Kliks",
    ctr: "CTR",
    convShort: "Conv.",
    bySource: "Conversies per bron",
    noPixel: "Nog geen websitedata",
    noPixelBody:
      "Zodra de LeadLayer-tracking op je site staat, zie je hier bezoekers, kliks en conversies per CTA.",
  },

  // Sections
  latestReport: "Laatste rapport",
  recentLeads: "Nieuwste leads",
  allLeads: "Alle leads",
  whatWeDid: "Wat we voor je deden",
  comingNext: "Hierna gepland",
  howItWorks: "Zo werkt het",
  howSteps: [
    {
      title: "Wij bouwen",
      copy: "Pagina's die scoren in Google, voor de opdrachten die jij wilt.",
    },
    { title: "Jij wordt gevonden", copy: "Elke aanvraag en elk telefoontje komt hier binnen." },
    {
      title: "Jij wint deals",
      copy: "Jij volgt op en sluit de deal. Wij meten wat het oplevert.",
    },
  ],

  // Leads page
  leadsTitle: "Leads",
  leadsTotal: (n: number) => `${n} totaal`,
  wonValue: (v: string) => `${v} gewonnen`,
  filterAll: "Alles",
  filterNew: "Nieuw",
  filterQualified: "In gesprek",
  filterWon: "Gewonnen",
  noLeads: "Nog geen leads in deze lijst.",
  unknownCaller: "Onbekend contact",
  callBack: "Bellen",
  emailBack: "Mailen",
  wonButton: "Gewonnen markeren",
  lostButton: "Niet doorgegaan",
  dismissing: "Even geduld…",
  leadDismissed: "Lead afgerond",

  // Sources
  sources: {
    call: "Telefoon",
    form: "Website",
    organic: "Google",
    referral: "Doorverwijzing",
  } as Record<string, string>,
  via: "via",

  // Statuses
  statusLabels: {
    new: "Nieuw",
    qualified: "In gesprek",
    won: "Gewonnen",
    lost: "Verloren",
    junk: "Niet relevant",
  } as Record<string, string>,

  // Won modal
  wonModalTitle: "Mooi. Wat was de deal waard?",
  wonModalBody: (name: string) =>
    `${name} — de dealwaarde telt mee in je omzet, zodat je ziet wat het systeem oplevert.`,
  wonAmountLabel: "Dealwaarde (€)",
  wonNotesLabel: "Notitie (optioneel)",
  wonNotesPlaceholder: "Soort klus, iets om te onthouden…",
  wonConfirm: "Bevestigen",
  wonSaving: "Opslaan…",
  wonToast: "Gewonnen! De omzet staat op je dashboard.",

  // Pages
  pagesKicker: "Je website",
  pagesTitle: (n: number) => `${n} pagina${n === 1 ? "" : "'s"} opgeleverd`,
  pagesNewBuilt: "Nieuw gebouwd",
  pagesImproved: "Verbeterd",
  pagesEmptyTitle: "Nog geen pagina's live.",
  pagesEmptyBody: "We bouwen aan je vindbaarheid. Zodra een pagina live gaat, zie je hem hier.",
  chipNew: "Nieuw",
  chipImproved: "Verbeterd",
  liveSince: "Live sinds",
  openPage: (t: string) => `Open ${t}`,

  // Reports
  reportsKicker: "Rapporten",
  reportsTitle: "Maandelijks bewijs",
  reportsSubtitle: "Wat we deden en wat het opleverde — elke maand, zonder ruis.",
  reportsEmptyTitle: "Nog geen rapporten.",
  reportsEmptyBody: "Je eerste rapport staat hier aan het einde van de maand.",
  reportPreparing: "Wordt opgesteld",
  reportLatest: "Nieuwste",
  reportLeads: (n: number) => `${n} leads`,
  reportPages: (n: number) => `${n} pagina's`,

  // Misc
  loading: "Je dashboard wordt geladen…",
  emptyTitle: "Nog even geduld",
  emptyBody: "We richten je groeidashboard in. Kom snel terug.",
  justNow: "Zojuist",
  minAgo: (n: number) => `${n} min geleden`,
  hrAgo: (n: number) => `${n} uur geleden`,
  dayAgo: (n: number) => `${n} ${n === 1 ? "dag" : "dagen"} geleden`,

  // Public report
  report: {
    kicker: "Maandrapport",
    goalProgress: "Doelvoortgang",
    leadsThisPeriod: "Leads deze periode",
    requiredPerMonth: "Nodig per maand",
    gap: "Verschil",
    onTrack: "Op schema",
    pagesPublished: "Pagina's gepubliceerd",
    pagesInDraft: "Pagina's in concept",
    closedRevenue: "Gewonnen omzet deze periode",
    fromWonLeads: (n: number) => `Uit ${n} gewonnen ${n === 1 ? "lead" : "leads"} deze periode`,
    leadBreakdown: "Leads uitgesplitst",
    lbNew: "Nieuw",
    lbQualified: "In gesprek",
    lbWon: "Gewonnen",
    lbLost: "Verloren",
    lbJunk: "Niet relevant",
    workDelivered: "Opgeleverd werk",
    pagesImprovedStat: "Pagina's verbeterd",
    draftsInProgress: "Concepten onderweg",
    briefsApproved: "Briefings goedgekeurd",
    tasksCompleted: "Taken afgerond",
    summary: "Samenvatting",
    nextUp: "Hierna",
    worthKnowing: "Goed om te weten",
    generatedBy: "Gegenereerd door LeadLayer",
    readOnly: "Alleen-lezen link",
    notFoundTitle: "Rapport niet gevonden",
    notFoundBody:
      "Deze link is mogelijk verlopen of ingetrokken. Vraag je LeadLayer-contact om een nieuwe.",
    loading: "Rapport wordt geladen…",
  },
};

const en: typeof nl = {
  tabs: { home: "Home", leads: "Leads", pages: "Pages", reports: "Reports" },
  signOut: "Sign out",
  poweredBy: "Powered by LeadLayer",

  greetingMorning: "Good morning",
  greetingAfternoon: "Good afternoon",
  greetingEvening: "Good evening",

  thisMonthsGoal: "This month's goal",
  goalOf: (actual: number, target: number) => `${actual} of ${target}`,
  leadsWord: "leads",
  statusAhead: "You're ahead of pace",
  statusOnTrack: "You're on track",
  statusBehind: "Not on pace yet — we're on it",
  statusComplete: "Goal reached",
  statusProgress: "In full swing",
  daysLeft: (d: number) => `${d} ${d === 1 ? "day" : "days"} left`,

  statLeadsMonth: "Leads this month",
  statRevenue: "Revenue won",
  statPagesLive: "Pages live",
  vsLastMonth: (m: string) => `vs ${m}`,

  analytics: {
    last30: "Last 30 days",
    visitors: "Visitors",
    pageviews: "Pageviews",
    conversions: "Conversions",
    conversionRate: "Conversion rate",
    trafficTrend: "Traffic & conversions",
    ctaPerformance: "CTA performance",
    ctaSub: "How each call-to-action performs",
    impressions: "Impressions",
    clicks: "Clicks",
    ctr: "CTR",
    convShort: "Conv.",
    bySource: "Conversions by source",
    noPixel: "No website data yet",
    noPixelBody:
      "Once the LeadLayer tracking is on your site, you'll see visitors, clicks, and conversions per CTA here.",
  },

  latestReport: "Latest report",
  recentLeads: "Newest leads",
  allLeads: "All leads",
  whatWeDid: "What we did for you",
  comingNext: "Coming next",
  howItWorks: "How it works",
  howSteps: [
    { title: "We build", copy: "Pages that rank on Google, for the work you actually want." },
    { title: "You get found", copy: "Every call and enquiry lands right here." },
    { title: "You win deals", copy: "You follow up and close. We measure what it's worth." },
  ],

  leadsTitle: "Leads",
  leadsTotal: (n: number) => `${n} total`,
  wonValue: (v: string) => `${v} won`,
  filterAll: "All",
  filterNew: "New",
  filterQualified: "In progress",
  filterWon: "Won",
  noLeads: "No leads in this list yet.",
  unknownCaller: "Unknown contact",
  callBack: "Call",
  emailBack: "Email",
  wonButton: "Mark as won",
  lostButton: "Didn't go anywhere",
  dismissing: "One moment…",
  leadDismissed: "Lead closed",

  sources: { call: "Phone", form: "Website", organic: "Google", referral: "Referral" },
  via: "via",

  statusLabels: {
    new: "New",
    qualified: "In progress",
    won: "Won",
    lost: "Lost",
    junk: "Not relevant",
  },

  wonModalTitle: "Nice. What was the deal worth?",
  wonModalBody: (name: string) =>
    `${name} — the deal value counts toward your revenue, so you see what the system pays back.`,
  wonAmountLabel: "Deal value ($)",
  wonNotesLabel: "Notes (optional)",
  wonNotesPlaceholder: "Type of job, anything worth remembering…",
  wonConfirm: "Confirm",
  wonSaving: "Saving…",
  wonToast: "Won! Revenue added to your dashboard.",

  pagesKicker: "Your website",
  pagesTitle: (n: number) => `${n} page${n === 1 ? "" : "s"} delivered`,
  pagesNewBuilt: "Newly built",
  pagesImproved: "Improved",
  pagesEmptyTitle: "No pages live yet.",
  pagesEmptyBody:
    "We're building your search coverage. The moment a page goes live, it shows up here.",
  chipNew: "New",
  chipImproved: "Improved",
  liveSince: "Live since",
  openPage: (t: string) => `Open ${t}`,

  reportsKicker: "Reports",
  reportsTitle: "Monthly proof",
  reportsSubtitle: "What we did and what it brought in — every month, no noise.",
  reportsEmptyTitle: "No reports yet.",
  reportsEmptyBody: "Your first report lands here at the end of the month.",
  reportPreparing: "Being prepared",
  reportLatest: "Latest",
  reportLeads: (n: number) => `${n} leads`,
  reportPages: (n: number) => `${n} pages`,

  loading: "Loading your dashboard…",
  emptyTitle: "Almost there",
  emptyBody: "We're setting up your growth dashboard. Check back soon.",
  justNow: "Just now",
  minAgo: (n: number) => `${n}m ago`,
  hrAgo: (n: number) => `${n}h ago`,
  dayAgo: (n: number) => `${n}d ago`,

  report: {
    kicker: "Monthly progress report",
    goalProgress: "Goal progress",
    leadsThisPeriod: "Leads this period",
    requiredPerMonth: "Required / month",
    gap: "Gap",
    onTrack: "On track",
    pagesPublished: "Pages published",
    pagesInDraft: "Pages in draft",
    closedRevenue: "Closed revenue this period",
    fromWonLeads: (n: number) => `From ${n} won lead${n === 1 ? "" : "s"} this period`,
    leadBreakdown: "Lead breakdown",
    lbNew: "New",
    lbQualified: "Qualified",
    lbWon: "Won",
    lbLost: "Lost",
    lbJunk: "Unqualified",
    workDelivered: "Work delivered",
    pagesImprovedStat: "Pages improved",
    draftsInProgress: "Drafts in progress",
    briefsApproved: "Briefs approved",
    tasksCompleted: "Tasks completed",
    summary: "Summary",
    nextUp: "Next up",
    worthKnowing: "Worth knowing",
    generatedBy: "Generated by LeadLayer",
    readOnly: "Read-only link",
    notFoundTitle: "Report not found",
    notFoundBody:
      "This link may have expired or been revoked. Ask your LeadLayer contact for a new one.",
    loading: "Loading report…",
  },
};

export const PORTAL_COPY = { nl, en } as const;
export type PortalCopy = typeof nl;

export function portalCopy(locale: PortalLocale | undefined): PortalCopy {
  return PORTAL_COPY[locale ?? "en"];
}

// ── Locale-aware formatters ─────────────────────────────────────────

const INTL_LOCALE: Record<PortalLocale, string> = { nl: "nl-NL", en: "en-US" };
const CURRENCY: Record<PortalLocale, string> = { nl: "EUR", en: "USD" };

export function formatMoney(n: number, locale: PortalLocale = "en"): string {
  const value = !n || !Number.isFinite(n) ? 0 : n;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: CURRENCY[locale],
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string, locale: PortalLocale = "en"): string {
  return new Date(iso).toLocaleDateString(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(iso: string, locale: PortalLocale = "en"): string {
  if (!iso) return "";
  const c = portalCopy(locale);
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return c.justNow;
  if (min < 60) return c.minAgo(min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return c.hrAgo(hr);
  const d = Math.floor(hr / 24);
  if (d < 30) return c.dayAgo(d);
  return new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "short" });
}

export function greeting(locale: PortalLocale = "en", date = new Date()): string {
  const c = portalCopy(locale);
  const h = date.getHours();
  if (h < 12) return c.greetingMorning;
  if (h < 18) return c.greetingAfternoon;
  return c.greetingEvening;
}

export function formatDayline(locale: PortalLocale = "en", date = new Date()): string {
  return date.toLocaleDateString(INTL_LOCALE[locale] === "nl-NL" ? "nl-NL" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function monthShort(date: Date, locale: PortalLocale = "en"): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], { month: "short" });
}
