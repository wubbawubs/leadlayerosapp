import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background bg-blueprint text-foreground">
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
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-6 pb-24 pt-12 md:pt-20">
        <div className="max-w-3xl">
          <p className="mb-6 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Foundation · S0 ready
          </p>
          <h1 className="font-display text-5xl leading-[0.95] text-foreground md:text-7xl">
            Lead infrastructure for{" "}
            <span className="text-primary">service businesses.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            LeadLayer OS connects search, your website and tracking into one
            system, built to deliver qualified enquiries every single month.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground hover:opacity-90"
            >
              Create operator account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center rounded-md border border-border bg-card px-5 py-3 font-medium text-foreground hover:bg-secondary"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">
            Multi-tenant · WordPress · NL + US · AES-GCM secrets
          </p>
        </div>
      </main>
    </div>
  );
}
