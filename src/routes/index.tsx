/**
 * App landing — the Liquid OS front door (Design v5).
 * Night canvas with a drifting aurora, floating glass nav, liquid amber CTA.
 * This is the app gate, not the marketing site: one strong screen,
 * sign-in as the primary action, leadlayer.studio for the pitch.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Mark } from "@/components/brand/Mark";
import { GlassButton } from "@/components/ui/glass-button";

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
    <div className="night relative flex min-h-screen flex-col overflow-x-clip">
      {/* Plane 0 — canvas */}
      <div className="aurora-night" aria-hidden>
        <i className="an-1" />
        <i className="an-2" />
        <i className="an-3" />
      </div>
      <div className="noise pointer-events-none fixed inset-0 z-[1] opacity-50" aria-hidden />

      {/* Floating glass nav */}
      <header className="sticky top-3.5 z-50 flex justify-center px-4">
        <div className="glass flex h-14 w-full max-w-3xl items-center justify-between rounded-[28px] pl-5 pr-2.5">
          <div className="flex items-center gap-2.5">
            <Mark className="h-6 w-6 shrink-0" />
            <span className="text-[15px] font-extrabold tracking-tight">
              LeadLayer <span className="text-[#E8913A]">OS</span>
            </span>
          </div>
          <GlassButton asChild variant="amber" size="sm">
            <Link to="/login">
              Sign in <ArrowRight />
            </Link>
          </GlassButton>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-[2] mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="pb-20 pt-20 md:pt-28 text-center">
          <p className="enter-liquid text-[12.5px] font-bold uppercase tracking-[0.16em] text-[rgba(245,242,236,0.45)]">
            Lead generation infrastructure
          </p>
          <h1 className="enter-liquid stagger-2 mx-auto mt-5 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-[-0.04em] md:text-7xl">
            Stop renting leads.
            <br />
            <span className="bg-gradient-to-r from-[#F0A050] via-[#E8913A] to-[#D97706] bg-clip-text text-transparent">
              Start owning them.
            </span>
          </h1>
          <p className="enter-liquid stagger-3 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[rgba(245,242,236,0.60)]">
            LeadLayer connects search, your website and lead tracking into one system you own —
            built to deliver qualified enquiries every single month.
          </p>

          <div className="enter-liquid stagger-4 mt-10 flex flex-wrap items-center justify-center gap-4">
            <GlassButton asChild variant="amber">
              <Link to="/login">
                Open your dashboard <ArrowRight />
              </Link>
            </GlassButton>
            <GlassButton asChild variant="ghost">
              <a href="https://leadlayer.studio" target="_blank" rel="noopener noreferrer">
                What is LeadLayer?
              </a>
            </GlassButton>
          </div>
        </section>

        {/* The three layers — glass tiles */}
        <section className="enter-liquid stagger-5 pb-24">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.16em] text-[#E8913A]">
            One system, three layers
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {LAYERS.map((l) => (
              <div key={l.n} className="glass rounded-[24px] p-6">
                <p className="font-mono text-sm font-bold text-[#F0A050]">{l.n}</p>
                <h3 className="mt-2 text-xl font-bold tracking-tight">{l.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[rgba(245,242,236,0.60)]">
                  {l.copy}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-[2] mx-auto w-full max-w-5xl px-6">
        <div className="h-px w-full bg-[rgba(255,255,255,0.08)]" />
        <div className="flex flex-wrap items-center justify-between gap-3 py-6">
          <p className="text-sm text-[rgba(245,242,236,0.40)]">LeadLayer · Hoorn, NL</p>
          <div className="flex items-center gap-5 text-sm text-[rgba(245,242,236,0.40)]">
            <a
              href="https://leadlayer.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-[#F5F2EC]"
            >
              leadlayer.studio
            </a>
            <Link to="/login" className="transition hover:text-[#F5F2EC]">
              Client sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
