import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { Logo } from "@/components/brand/Logo";
import { TenantSwitcher } from "@/components/app/TenantSwitcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  createSiteConnection,
  listSiteConnections,
  probeSiteConnection,
} from "@/lib/shared/db/repos/siteConnections.functions";
import { startWpcomOAuth } from "@/lib/shared/wpcom/wpcom.functions";
import { CreateSiteConnectionSchema } from "@/lib/shared/db/repos/siteConnections.schemas";

export const Route = createFileRoute("/_authenticated/sites")({
  component: SitesPage,
});

function SitesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchSites = useServerFn(listSiteConnections);
  const create = useServerFn(createSiteConnection);
  const probe = useServerFn(probeSiteConnection);
  const startOAuth = useServerFn(startWpcomOAuth);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenants.length) return;
    const stored = typeof window !== "undefined"
      ? localStorage.getItem("ll.activeTenantId")
      : null;
    const valid = tenants.find((t) => t.id === stored)?.id ?? tenants[0].id;
    setTenantId(valid);
  }, [tenants]);

  const sitesQuery = useQuery({
    queryKey: ["site-connections", tenantId],
    queryFn: () => fetchSites({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const probeMutation = useMutation({
    mutationFn: (id: string) => probe({ data: { siteConnectionId: id } }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["site-connections", tenantId] }),
  });

  const [connectOpen, setConnectOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  const connectMutation = useMutation({
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
      return { probeRes };
    },
    onSuccess: ({ probeRes }) => {
      qc.invalidateQueries({ queryKey: ["site-connections", tenantId] });
      if (probeRes.status === "connected") {
        setProbeMsg("Connected — probe succeeded");
        window.setTimeout(() => {
          setConnectOpen(false);
          setBaseUrl("");
          setUsername("");
          setAppPassword("");
          setProbeMsg(null);
        }, 700);
      } else {
        setProbeMsg(
          `Saved, but probe failed: ${(probeRes.probeResult as { error?: string }).error ?? "unknown"}`,
        );
      }
    },
    onError: (e) => setConnectError((e as Error).message),
  });

  function onConnectSubmit(e: FormEvent) {
    e.preventDefault();
    setConnectError(null);
    setProbeMsg(null);
    connectMutation.mutate();
  }

  if (tenantsQuery.isLoading) {
    return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  }
  if (!tenants.length) {
    return (
      <Shell>
        <p className="text-muted-foreground">
          You need a tenant first.{" "}
          <Link to="/onboarding" className="text-primary underline">
            Start onboarding
          </Link>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell tenants={tenants} onSignOut={() => navigate({ to: "/" })}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            S2 · Site connect
          </p>
          <h1 className="font-display text-4xl text-foreground">
            Connected sites
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!tenantId) return;
              try {
                const { authorizeUrl } = await startOAuth({
                  data: { tenantId },
                });
                window.location.href = authorizeUrl;
              } catch (e) {
                setConnectError((e as Error).message);
              }
            }}
            disabled={!tenantId}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
          >
            Connect WordPress.com
          </button>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + Connect self-hosted
          </button>
        </div>
      </div>

      <ConnectSiteDialog
        open={connectOpen}
        onOpenChange={(open) => {
          setConnectOpen(open);
          if (open) return;
          setConnectError(null);
          setProbeMsg(null);
        }}
        tenants={tenants}
        tenantId={tenantId}
        onTenantChange={setTenantId}
        baseUrl={baseUrl}
        onBaseUrlChange={setBaseUrl}
        username={username}
        onUsernameChange={setUsername}
        appPassword={appPassword}
        onAppPasswordChange={setAppPassword}
        error={connectError}
        probeMsg={probeMsg}
        isPending={connectMutation.isPending}
        onSubmit={onConnectSubmit}
      />

      {sitesQuery.isLoading && <p className="text-muted-foreground">Loading sites…</p>}
      {sitesQuery.error && (
        <p className="text-destructive text-sm">
          {(sitesQuery.error as Error).message}
        </p>
      )}
      {sitesQuery.data && sitesQuery.data.connections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-muted-foreground">
            No sites connected yet. Connect your first WordPress site to get started.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sitesQuery.data?.connections.map((c) => {
          const result = (c.probe_result ?? null) as null | {
            ok?: boolean;
            error?: string;
            user?: { name?: string; roles?: string[] };
            httpStatus?: number;
            elapsedMs?: number;
          };
          return (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card/70 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} hasProbe={!!c.last_probe_at} />
                    <span className="font-mono text-sm text-foreground truncate">
                      {c.base_url}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.type} · user <span className="font-mono">{c.username}</span>
                    {c.last_probe_at && (
                      <> · probed {new Date(c.last_probe_at).toLocaleString()}</>
                    )}
                  </p>
                  {result && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {result.ok && result.user
                        ? `OK · ${result.user.name} (${result.user.roles?.join(", ") || "no roles"}) · ${result.elapsedMs}ms`
                        : result.error || "Unknown result"}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => probeMutation.mutate(c.id)}
                  disabled={probeMutation.isPending && probeMutation.variables === c.id}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
                >
                  {probeMutation.isPending && probeMutation.variables === c.id
                    ? "Probing…"
                    : "Re-probe"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function ConnectSiteDialog({
  open,
  onOpenChange,
  tenants,
  tenantId,
  onTenantChange,
  baseUrl,
  onBaseUrlChange,
  username,
  onUsernameChange,
  appPassword,
  onAppPasswordChange,
  error,
  probeMsg,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: { id: string; name: string; geo: string; vertical: string; status: string }[];
  tenantId: string | null;
  onTenantChange: (tenantId: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  username: string;
  onUsernameChange: (value: string) => void;
  appPassword: string;
  onAppPasswordChange: (value: string) => void;
  error: string | null;
  probeMsg: string | null;
  isPending: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-card p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="font-display text-3xl font-normal text-foreground">
            Connect WordPress site
          </DialogTitle>
          <DialogDescription>
            Create an Application Password in WordPress, then paste it here to save and probe the connection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-6 px-6 pb-6 md:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border border-dashed border-border bg-background/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Setup
            </p>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">1.</span> Open WordPress → Users → Profile.</li>
              <li><span className="font-medium text-foreground">2.</span> Add an Application Password for LeadLayerOS.</li>
              <li><span className="font-medium text-foreground">3.</span> Copy the generated password and connect.</li>
            </ol>
          </div>

          <div className="space-y-4">
            {tenants.length > 1 && (
              <Field label="Tenant">
                <select
                  value={tenantId ?? ""}
                  onChange={(e) => onTenantChange(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Site URL" hint="Including https://">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>

            <Field label="WordPress username">
              <input
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder="admin"
                autoComplete="off"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Application password" hint="Spaces are OK.">
              <input
                type="password"
                value={appPassword}
                onChange={(e) => onAppPasswordChange(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                autoComplete="new-password"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>

            {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {probeMsg && <p className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">{probeMsg}</p>}

            <button
              type="submit"
              disabled={isPending || !tenantId}
              className="w-full rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {isPending ? "Connecting…" : "Connect & probe"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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

function StatusBadge({
  status,
  hasProbe,
}: {
  status: string;
  hasProbe: boolean;
}) {
  if (!hasProbe || status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Never probed
      </span>
    );
  }
  if (status === "connected") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
      {status}
    </span>
  );
}

function Shell({
  children,
  tenants,
  onSignOut,
}: {
  children: React.ReactNode;
  tenants?: { id: string; name: string; geo: string; vertical: string; status: string }[];
  onSignOut?: () => void;

}) {
  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/sites" className="text-foreground font-medium">
              Sites
            </Link>
          </nav>
        </div>
        {tenants && (
          <div className="flex items-center gap-2">
            <TenantSwitcher tenants={tenants} />
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </header>
      <main className="container mx-auto px-6 pb-24 pt-4">{children}</main>
    </div>
  );
}
