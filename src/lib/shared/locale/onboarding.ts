export const onboardingCopy = {
  en: {
    welcome: {
      eyebrow: "Sprint 1 · Onboarding",
      title: "Let's set up your LeadLayer workspace.",
      body: "Three quick steps: tell us about your business, point us at your website, and you're in. Takes under two minutes.",
      cta: "Start",
    },
    business: {
      title: "About your business",
      body: "We use this to scope the audit and content plan.",
      name: "Business name",
      geo: "Primary market",
      vertical: "Industry",
      next: "Continue",
    },
    site: {
      title: "Your website",
      body: "We won't touch anything yet — we'll probe it for connectivity in the next sprint.",
      url: "Website URL",
      next: "Create workspace",
    },
    done: {
      title: "You're in.",
      body: "Your tenant is created. Next sprint connects WordPress so we can probe and audit.",
      cta: "Open dashboard",
    },
    verticals: {
      home_services: "Home services",
      healthcare: "Healthcare",
      legal: "Legal",
      insurance: "Insurance",
      consulting: "Consulting",
      b2b: "B2B services",
      other: "Other",
    },
  },
} as const;

export type OnboardingCopy = typeof onboardingCopy["en"];
