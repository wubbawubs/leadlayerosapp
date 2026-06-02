import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Circle, Copy, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  getTenantSummary,
  type TenantSummary,
} from "@/lib/shared/db/repos/tenants.functions";
import {
  generateClientPortalToken,
  revokeClientPortalToken,
  getClientPortalInfo,
} from "@/lib/shared/clientPortal/clientPortal.functions";
import { SkeletonSettingsRow } from "@/components/ui/Skeletons";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/settings")({
  component: ClientSettings,
  head: () => ({ meta: [{ title: "Settings — LeadLayer" }] }),
});

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

function StatusTag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
        ok ? "text-status-green" : "text-muted-foreground"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <Circle className="h-3 w-3 shrink-0" />
      )}
      {label}
    </span>
  );
}

function WarningTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-status-amber">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}

function deriveStatus(summary: TenantSummary | null | undefined, key: string): React.ReactNode {
  if (!summary) return null;

  switch (key) {
    case "growth-goal":
      if (summary.growthGoal) {
        const tier = summary.growthGoal.tier ? ` · ${summary.growthGoal.tier}` : "";
        return <StatusTag ok label={`Active${tier}`} />;
      }
      return <WarningTag label="Not set" />;

    case "business-profile":
      if (summary.businessProfile.filled)
        return <StatusTag ok label={summary.businessProfile.status ?? "filled"} />;
      if (summary.businessProfile.status)
        return <WarningTag label={summary.businessProfile.status} />;
      return <WarningTag label="Not started" />;

    case "tone-profile":
      if (summary.toneProfile.filled)
        return <StatusTag ok label={summary.toneProfile.status ?? "ready"} />;
      return <WarningTag label="Not started" />;

    case "wordpress":
      if (summary.wordpressConnection) {
        const connected = summary.wordpressConnection.status === "connected";
        const host = (() => {
          try {
            return new URL(summary.wordpressConnection.siteUrl).hostname;
          } catch {
            return summary.wordpressConnection.siteUrl;
          }
        })();
        return connected ? (
          <StatusTag ok label={host} />
        ) : (
          <WarningTag label={`${summary.wordpressConnection.status} · ${host}`} />
        );
      }
      return <WarningTag label="Not connected" />;

    case "lead-ingestion":
      if (summary.leadIngestion.active) return <StatusTag ok label="Webhook active" />;
      if (summary.leadIngestion.hasSource) return <WarningTag label="Source inactive" />;
      return <WarningTag label="Not configured" />;

    case "intelligence-pipeline":
      if (summary.intelligencePipeline.lastRunAt) {
        const d = new Date(summary.intelligencePipeline.lastRunAt);
        const label = `Last run ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
        const ok = summary.intelligencePipeline.lastRunStatus === "completed";
        return ok ? <StatusTag ok label={label} /> : <WarningTag label={label} />;
      }
      return <WarningTag label="Not run" />;

    case "gbp":
      return summary.gbp.connected
        ? <StatusTag ok label="Connected" />
        : <WarningTag label="Not connected" />;

    case "page-inventory":
      return summary.pageInventory.count > 0
        ? <StatusTag ok label={`${summary.pageInventory.count} pages indexed`} />
        : <WarningTag label="Not synced" />;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Client portal row — inline token management
// ---------------------------------------------------------------------------

function ClientPortalRow({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateClientPortalToken);
  const revokeFn = useServerFn(revokeClientPortalToken);
  const infoFn = useServerFn(getClientPortalInfo);

  const infoQ = useQuery({
    queryKey: ["client-portal-info", tenantId],
    queryFn: () => infoFn({ data: { tenantId } }),
    staleTime: 30_000,
  });

  const token = infoQ.data?.portalToken ?? null;
  const portalUrl = token && typeof window !== "undefined"
    ? `${window.location.origin}/portal/${token}`
    : null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-portal-info", tenantId] });

  const genMutation = useMutation({
    mutationFn: () => genFn({ data: { tenantId } }),
    onSuccess: () => { toast.success("Client portal link generated"); invalidate(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeFn({ data: { tenantId } }),
    onSuccess: () => { toast.success("Portal link revoked"); invalidate(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="flex items-start justify-between gap-4 border-t border-border px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-sm font-medium text-foreground">Client portal</p>
          {token ? (
            <StatusTag ok label="Active · link ready" />
          ) : (
            <WarningTag label="Not generated" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Permanent dashboard link for your client. Always live data, no login required.
        </p>
        {portalUrl && (
          <p className="mt-1.5 max-w-xs truncate font-mono text-[10px] text-muted-foreground">
            {portalUrl}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {portalUrl && (
          <>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Portal link copied"); }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            <a
              href={`/portal/${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Preview →
            </a>
            <button
              type="button"
              onClick={() => genMutation.mutate()}
              disabled={genMutation.isPending}
              title="Regenerate link (invalidates old link)"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-status-red hover:border-status-red/30 hover:bg-status-red-soft/20"
            >
              <Link2Off className="h-3 w-3" /> Revoke
            </button>
          </>
        )}
        {!token && (
          <button
            type="button"
            onClick={() => genMutation.mutate()}
            disabled={genMutation.isPending}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            {genMutation.isPending ? "Generating…" : "Generate link →"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings groups
// ---------------------------------------------------------------------------

type Row = {
  key: string;
  title: string;
  description: string;
  to: string;
};

type Group = {
  label: string;
  rows: Row[];
};

function buildGroups(): Group[] {
  return [
    {
      label: "Growth",
      rows: [
        {
          key: "growth-goal",
          title: "Growth goal",
          description: "Target clients, close rate, and required lead volume.",
          to: "/settings/growth-goal",
        },
        {
          key: "business-profile",
          title: "Business profile",
          description: "Services, locations, and offer details used across deliverables.",
          to: "/settings/business-profile",
        },
        {
          key: "tone-profile",
          title: "Tone profile",
          description: "Voice and writing style applied to all generated copy.",
          to: "/settings/tone-profile",
        },
      ],
    },
    {
      label: "Delivery",
      rows: [
        {
          key: "wordpress",
          title: "WordPress connection",
          description: "Manage connected sites and credentials.",
          to: "/sites",
        },
        {
          key: "lead-ingestion",
          title: "Lead ingestion",
          description: "Webhook key for capturing inbound leads automatically.",
          to: "/growth/leads",
        },
      ],
    },
    {
      label: "Intelligence",
      rows: [
        {
          key: "intelligence-pipeline",
          title: "Intelligence pipeline",
          description: "Run and inspect the full intelligence pipeline.",
          to: "/growth/intelligence",
        },
        {
          key: "page-inventory",
          title: "Page inventory",
          description: "WordPress site inventory for page mapping and optimization.",
          to: "/sites",
        },
        {
          key: "gbp",
          title: "GBP profile",
          description: "Google Business Profile signals and optimization.",
          to: "/growth/gbp",
        },
        {
          key: "product-flow",
          title: "Product flow",
          description: "Orchestrated flow across intelligence stages.",
          to: "/growth/flow",
        },
        {
          key: "masterplan",
          title: "Masterplan",
          description: "Strategic masterplan and proposal generation.",
          to: "/growth/masterplan",
        },
        {
          key: "monthly-plan",
          title: "Monthly plan",
          description: "Monthly execution plan and selected actions.",
          to: "/growth/monthly-plan",
        },
      ],
    },
    {
      label: "Advanced",
      rows: [
        {
          key: "audits",
          title: "Audits",
          description: "Site audits, comparisons, and proposal artifacts.",
          to: "/sites",
        },
        {
          key: "blueprint",
          title: "Blueprint",
          description: "Generated page blueprint and priority structure.",
          to: "/growth/blueprint",
        },
        {
          key: "legacy",
          title: "Legacy dashboard",
          description: "Original single-tenant dashboard and tools.",
          to: "/app",
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ClientSettings() {
  const { tenantId } = Route.useParams();
  const fetchSummary = useServerFn(getTenantSummary);

  const summaryQuery = useQuery({
    queryKey: ["tenant-summary", tenantId],
    queryFn: () => fetchSummary({ data: { tenantId } }),
    staleTime: 30_000,
  });

  const summary = summaryQuery.data ?? null;
  const loading = summaryQuery.isLoading;
  const groups = buildGroups();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          § Client settings
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          Configuration hub
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Links to existing setup and configuration tools for this client.
        </p>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.label}>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              § {group.label}
            </p>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {loading ? (
                group.rows.map((_, i) => <SkeletonSettingsRow key={i} />)
              ) : (
                <>
                {group.rows.map((row, i) => (
                  <div
                    key={row.key}
                    className={`flex items-center justify-between gap-4 px-5 py-4 ${
                      i > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-3">
                        <p className="text-sm font-medium text-foreground">{row.title}</p>
                        {deriveStatus(summary, row.key)}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.description}
                      </p>
                    </div>
                    <Link
                      to={row.to}
                      className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Open →
                    </Link>
                  </div>
                ))}
                {group.label === "Delivery" && (
                  <ClientPortalRow tenantId={tenantId} />
                )}
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
