import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-foreground shadow-elegant hover:opacity-90"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-6 pb-24 pt-10">
        <section className="relative overflow-hidden rounded-[2rem] bg-hero bg-dots px-8 py-20 md:px-16 md:py-28">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Operator console · S0 ready
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white md:text-5xl">
            Right now,<br />every single day,
          </h1>
          <h2 className="font-hero mt-4 text-6xl text-accent md:text-[7.5rem]">
            YOU'RE LEAKING LEADS.
          </h2>

          <div className="mt-12 grid gap-10 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Plug the leak.
              </p>
              <p className="max-w-md text-base text-white/80">
                LeadLayer OS connects search, your website and tracking into
                one system, built to deliver qualified enquiries every single
                month.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-7 py-4 font-semibold uppercase tracking-wide text-accent-foreground shadow-glow hover:opacity-90"
              >
                Create operator account <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">
                Multi-tenant · WordPress · NL + US · AES-GCM secrets
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
