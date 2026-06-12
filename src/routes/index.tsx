/**
 * App landing — paper surface, mirrors leadlayer.studio.
 * This is the app gate, not the marketing site: one strong screen,
 * sign-in as the primary action, leadlayer.studio for the pitch.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Mark } from "@/components/brand/Mark";

export const Route = createFileRoute("/")({
  component: Index,
});

const LAYERS = [
  {
    n: "01",
    title: "Search",
    copy: "Pages built to rank for the jobs you actually want, in the towns you actually serve.",
  },
  {
    n: "02",
    title: "Site",
    copy: "Your website becomes the asset. Every page published is owned, not rented.",
  },
  {
    n: "03",
    title: "Tracking",
    copy: "Every call and form lands in one place, with proof of what it's worth.",
  },
];

function Index() {
  return (
    <div className="paper paper-grain flex min-h-screen flex-col">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Mark className="h-7 w-7 shrink-0" />
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            LeadLayer <span className="text-amber">OS</span>
          </span>
        </div>
        <Link to="/login" className="cta-shear cta-shear-sm">
          Sign in <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <div className="rule-hair" />

      {/* Hero */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="py-16 md:py-24">
          <p className="label-mono">Lead generation infrastructure</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-ink md:text-7xl">
            Stop renting leads.
            <br />
            <span className="text-amber">Start owning them.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            LeadLayer connects search, your website and lead tracking into one system you own —
            built to deliver qualified enquiries every single month.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link to="/login" className="cta-shear">
              Open your dashboard <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://leadlayer.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-medium text-ink-2 underline-offset-4 transition hover:text-ink hover:underline"
            >
              What is LeadLayer? →
            </a>
          </div>
        </section>

        {/* The three layers — charcoal band */}
        <section className="surface-charcoal mb-16 rounded-[4px] px-6 py-10 md:px-10 md:py-12">
          <p className="label-mono">One system, three layers</p>
          <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-6">
            {LAYERS.map((l) => (
              <div key={l.n}>
                <p className="font-mono text-sm text-amber">{l.n}</p>
                <h3 className="mt-2 font-display text-xl font-semibold text-ink">{l.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{l.copy}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-5xl px-6">
        <div className="rule-hair" />
        <div className="flex flex-wrap items-center justify-between gap-3 py-6">
          <p className="text-sm text-ink-3">LeadLayer · Hoorn, NL</p>
          <div className="flex items-center gap-5 text-sm text-ink-3">
            <a
              href="https://leadlayer.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-ink"
            >
              leadlayer.studio
            </a>
            <Link to="/login" className="transition hover:text-ink">
              Client sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
