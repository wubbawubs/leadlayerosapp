import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  createSiteConnection,
  probeSiteConnection,
} from "@/lib/shared/db/repos/siteConnections.functions";
import { CreateSiteConnectionSchema } from "@/lib/shared/db/repos/siteConnections.schemas";

export const Route = createFileRoute("/_authenticated/sites/new")({
  component: NewSitePage,
});

function NewSitePage() {
  const navigate = useNavigate();
  const fetchTenants = useServerFn(listMyTenants);
  const create = useServerFn(createSiteConnection);
  const probe = useServerFn(probeSiteConnection);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenants = tenantsQuery.data?.tenants ?? [];

  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    if (!tenants.length) return;
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem("ll.activeTenantId")
        : null;
    setTenantId(tenants.find((t) => t.id === stored)?.id ?? tenants[0].id);
  }, [tenants]);

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Pick a tenant first");
      const parsed = CreateSiteConnectionSchema.safeParse({
        tenantId,
        baseUrl,
        username,
        appPassword,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message ?? "Invalid input");
      }
      const { siteConnectionId } = await create({ data: parsed.data });
      const probeRes = await probe({ data: { siteConnectionId } });
      return { siteConnectionId, probeRes };
    },
    onSuccess: ({ probeRes }) => {
      if (probeRes.status === "connected") {
        setProbeMsg("✓ Connected — probe succeeded");
        setTimeout(() => navigate({ to: "/sites" }), 800);
      } else {
        setProbeMsg(
          `Saved, but probe failed: ${(probeRes.probeResult as { error?: string }).error ?? "unknown"}`,
        );
      }
    },
    onError: (e) => setError((e as Error).message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setProbeMsg(null);
    console.log("[sites/new] submit", { tenantId, baseUrl, username, hasPw: !!appPassword });
    submit.mutate();
  }


  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/sites" className="text-muted-foreground hover:text-foreground">
              Sites
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-6 pb-24 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          S2 · Connect WordPress
        </p>
        <h1 className="font-display text-4xl text-foreground">
          Connect a WordPress site
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We store your Application Password encrypted (AES-GCM). It is never
          returned to the browser after creation.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          {tenants.length > 1 && (
            <Field label="Tenant">
              <select
                value={tenantId ?? ""}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="Site URL"
            hint="The home URL of your WordPress site, including https://"
          >
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label="WordPress username">
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field
            label="Application password"
            hint="Create one in WordPress → Users → Profile → Application Passwords. Spaces are OK."
          >
            <input
              required
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />
          </Field>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {probeMsg && (
            <p
              className={`rounded-md px-3 py-2 text-sm ${
                probeMsg.startsWith("✓")
                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
            >
              {probeMsg}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submit.isPending || !tenantId}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submit.isPending ? "Connecting…" : "Connect & probe"}
            </button>
            <Link
              to="/sites"
              className="rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
