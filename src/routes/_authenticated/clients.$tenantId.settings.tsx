import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertCircle,
  Circle,
  Copy,
  Link2Off,
  RefreshCw,
  UserPlus,
  Trash2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { getTenantSummary, type TenantSummary } from "@/lib/shared/db/repos/tenants.functions";
import {
  inviteClientToTenant,
  listClientMembers,
  revokeClientAccess,
  type ClientMember,
} from "@/lib/shared/clientPortal/clientAuth.functions";
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
      {ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
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
        const probeAgo = summary.wordpressConnection.lastProbeAt
          ? formatRelativeCompact(summary.wordpressConnection.lastProbeAt)
          : null;
        return (
          <span className="flex flex-wrap items-center gap-2">
            {connected ? (
              <StatusTag ok label={host} />
            ) : (
              <WarningTag label={`${summary.wordpressConnection.status} · ${host}`} />
            )}
            {probeAgo && (
              <span className="font-mono text-[10px] text-muted-foreground">
                last synced {probeAgo}
              </span>
            )}
          </span>
        );
      }
      return <WarningTag label="Not connected" />;

    case "lead-ingestion": {
      const lastLead = summary.leadIngestion.lastLeadAt
        ? formatRelativeCompact(summary.leadIngestion.lastLeadAt)
        : null;
      const ingestionStatus = summary.leadIngestion.active ? (
        <StatusTag ok label="Webhook active" />
      ) : summary.leadIngestion.hasSource ? (
        <WarningTag label="Source inactive" />
      ) : (
        <WarningTag label="Not configured" />
      );
      return (
        <span className="flex flex-wrap items-center gap-2">
          {ingestionStatus}
          {lastLead && (
            <span className="font-mono text-[10px] text-muted-foreground">
              last lead {lastLead}
            </span>
          )}
        </span>
      );
    }

    case "intelligence-pipeline":
      if (summary.intelligencePipeline.lastRunAt) {
        const d = new Date(summary.intelligencePipeline.lastRunAt);
        const label = `Last run ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
        const ok = summary.intelligencePipeline.lastRunStatus === "completed";
        return ok ? <StatusTag ok label={label} /> : <WarningTag label={label} />;
      }
      return <WarningTag label="Not run" />;

    case "gbp":
      return summary.gbp.connected ? (
        <StatusTag ok label="Connected" />
      ) : (
        <WarningTag label="Not connected" />
      );

    case "page-inventory":
      return summary.pageInventory.count > 0 ? (
        <StatusTag ok label={`${summary.pageInventory.count} pages indexed`} />
      ) : (
        <WarningTag label="Not synced" />
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Client access row — invite clients by email, list + revoke access
// ---------------------------------------------------------------------------

function ClientAccessRow({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteClientToTenant);
  const listFn = useServerFn(listClientMembers);
  const revokeFn = useServerFn(revokeClientAccess);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"client_viewer" | "client_approver">("client_viewer");
  const [showing, setShowing] = useState(false);

  const membersQ = useQuery({
    queryKey: ["client-members", tenantId],
    queryFn: () => listFn({ data: { tenantId } }),
    staleTime: 30_000,
  });
  const members = membersQ.data?.members ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-members", tenantId] });

  const inviteMutation = useMutation({
    mutationFn: () => inviteFn({ data: { tenantId, email: email.trim(), role } }),
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Invite failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revokeFn({ data: { tenantId, userId } }),
    onSuccess: () => {
      toast.success("Access revoked");
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-sm font-medium text-foreground">Client access</p>
            {members.length > 0 ? (
              <StatusTag ok label={`${members.length} user${members.length === 1 ? "" : "s"}`} />
            ) : (
              <WarningTag label="No clients invited" />
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Invite your client to log in and see their live dashboard — leads, pages, and reports.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowing((s) => !s)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <UserPlus className="h-3 w-3" />
          Invite
        </button>
      </div>

      {members.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {(members as ClientMember[]).map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs text-foreground">{m.email ?? m.userId}</span>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {m.role === "client_approver" ? "Approver" : "Viewer"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => revokeMutation.mutate(m.userId)}
                disabled={revokeMutation.isPending}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Revoke access"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showing && (
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "client_viewer" | "client_approver")}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
          >
            <option value="client_viewer">Viewer</option>
            <option value="client_approver">Approver</option>
          </select>
          <button
            type="button"
            disabled={!email.trim() || inviteMutation.isPending}
            onClick={() => inviteMutation.mutate()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {inviteMutation.isPending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
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

function formatRelativeCompact(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

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
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
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
                    <>
                      <ClientAccessRow tenantId={tenantId} />
                    </>
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
