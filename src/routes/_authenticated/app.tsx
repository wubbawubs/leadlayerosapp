import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { TenantSwitcher } from "@/components/app/TenantSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { llmPing } from "@/lib/shared/llm/router.functions";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const navigate = useNavigate();
  const fetchTenants = useServerFn(listMyTenants);
  const ping = useServerFn(llmPing);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });

  const [pingResult, setPingResult] = useState<string | null>(null);
  const pingMutation = useMutation({
    mutationFn: async () => ping({ data: { prompt: "Reply with the single word: pong", task: "cheap" } }),
    onSuccess: (r) => setPingResult(r.text || "(empty)"),
    onError: (e) => setPingResult(`Error: ${(e as Error).message}`),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <span className="text-foreground font-medium">Dashboard</span>
            <Link to="/sites" className="text-muted-foreground hover:text-foreground">
              Sites
            </Link>
            <Link to="/settings/growth-goal" className="text-muted-foreground hover:text-foreground">
              Growth goal
            </Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <Link to="/settings/business-profile" className="text-muted-foreground hover:text-foreground">
              Business profile
            </Link>
            <Link to="/settings/tone-profile" className="text-muted-foreground hover:text-foreground">
              Tone profile
            </Link>
          </nav>


        </div>
        <div className="flex items-center gap-2">
          {tenantsQuery.data && tenantsQuery.data.tenants.length > 0 && (
            <TenantSwitcher tenants={tenantsQuery.data.tenants} />
          )}
          <button
            onClick={signOut}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Sign out
          </button>
        </div>
      </header>


      <main className="container mx-auto px-6 pb-24 pt-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Sprint 0 · Foundation ready
        </p>
        <h1 className="font-display text-5xl text-foreground">
          Welcome, <span className="text-primary">operator.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          The database, RLS, auth, AES-GCM secrets vault, repository layer,
          job schemas and LLM router are wired. S1 onboarding (tenant create
          + WordPress probe) is next.
        </p>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <Card title="Your tenants" subtitle="Repository layer · RLS scoped">
            {tenantsQuery.isLoading && <p className="text-muted-foreground">Loading…</p>}
            {tenantsQuery.error && (
              <p className="text-destructive text-sm">
                {(tenantsQuery.error as Error).message}
              </p>
            )}
            {tenantsQuery.data && tenantsQuery.data.tenants.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No tenants yet. They'll be created in the S1 onboarding wizard.
              </p>
            )}
            {tenantsQuery.data && tenantsQuery.data.tenants.length > 0 && (
              <ul className="space-y-2 text-sm">
                {tenantsQuery.data.tenants.map((t) => (
                  <li key={t.id} className="rounded border border-border bg-background/30 px-3 py-2">
                    <div className="font-medium text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.geo} · {t.vertical} · {t.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="LLM router" subtitle="Lovable AI Gateway · cheap tier">
            <button
              onClick={() => pingMutation.mutate()}
              disabled={pingMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pingMutation.isPending ? "Pinging…" : "Ping LLM router"}
            </button>
            {pingResult && (
              <pre className="mt-3 max-h-40 overflow-auto rounded border border-border bg-background/40 p-3 text-xs text-foreground">
                {pingResult}
              </pre>
            )}
          </Card>
        </section>

        <section className="mt-10 rounded-lg border border-dashed border-border bg-card/40 p-6">
          <h2 className="font-display text-2xl text-foreground">Next up — S1</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Onboarding wizard: site URL → WP probe → store result</li>
            <li>Tenant create + owner membership (atomic transaction)</li>
            <li>Site connection wizard with encrypted credentials</li>
            <li>Baseline snapshot job enqueued for the worker</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-5">
      <div className="mb-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
