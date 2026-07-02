import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Briefcase, Plus } from "lucide-react";
import { SkeletonClientCard } from "@/components/ui/Skeletons";
import { GlassButton } from "@/components/ui/glass-button";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getClientHealthSummaries,
  type ClientHealthSummary,
} from "@/lib/shared/execution/operatorQueue.functions";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsIndexPage,
  head: () => ({ meta: [{ title: "Clients — LeadLayer" }] }),
});

const HEALTH_TOP_BORDER: Record<ClientHealthSummary["health"], string> = {
  green: "border-t-2 border-t-[#27A644]",
  amber: "border-t-2 border-t-[#E8B94A]",
  red: "border-t-2 border-t-[#E54D4D]",
};

const HEALTH_BADGE: Record<ClientHealthSummary["health"], string> = {
  green: "bg-[rgba(39,166,68,0.12)] text-[#27A644]",
  amber: "bg-[rgba(232,185,74,0.12)] text-[#E8B94A]",
  red: "bg-[rgba(229,77,77,0.12)] text-[#E54D4D]",
};

function ClientsIndexPage() {
  const navigate = useNavigate();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchHealth = useServerFn(getClientHealthSummaries);

  const tenantsQuery = useQuery({ queryKey: ["my-tenants"], queryFn: () => fetchTenants() });
  const healthQuery = useQuery({
    queryKey: ["client-health"],
    queryFn: () => fetchHealth({ data: {} }),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const summaries = healthQuery.data?.summaries ?? [];
  const summaryById = new Map(summaries.map((s) => [s.tenantId, s]));

  const loading = tenantsQuery.isLoading && healthQuery.isLoading;
  const isEmpty = !loading && tenants.length === 0 && summaries.length === 0;

  return (
    <div className="mx-auto max-w-7xl animate-fade-up-in px-6 py-8 lg:px-8">
      {/* Page header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)]">
            Portfolio
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-[#F5F5F5]">
            Your clients
          </h1>
        </div>
        <GlassButton
          type="button"
          variant="amber"
          size="sm"
          onClick={() => navigate({ to: "/onboarding/welcome" })}
        >
          <Plus />
          Add client
        </GlassButton>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => (
            <SkeletonClientCard key={i} />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-[8px] border border-dashed border-[rgba(255,255,255,0.08)] px-6 py-12 text-center">
          <p className="text-sm text-[rgba(255,255,255,0.30)]">No clients yet.</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/onboarding/welcome" })}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#E8913A] hover:underline"
          >
            Add your first client <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {tenants.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((t) => (
            <ClientCard key={t.id} tenant={t} summary={summaryById.get(t.id) ?? null} />
          ))}
        </section>
      )}
    </div>
  );
}

function ClientCard({
  tenant,
  summary,
}: {
  tenant: { id: string; name: string; geo: string; vertical: string };
  summary: ClientHealthSummary | null;
}) {
  const lastActivity = summary?.lastDeliveryAt ?? summary?.lastActivityAt ?? null;

  return (
    <Link
      to="/clients/$tenantId"
      params={{ tenantId: tenant.id }}
      className="glass-tile glass-tile-hover group block rounded-[16px] p-4"
    >
      {/* Name + health badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate font-display text-sm font-semibold text-[#F5F5F5]">
          {tenant.name}
        </h3>
        {summary && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${HEALTH_BADGE[summary.health]}`}
          >
            {summary.health}
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[rgba(255,255,255,0.30)]">
        {tenant.geo && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {tenant.geo}
          </span>
        )}
        {tenant.vertical && (
          <span className="inline-flex items-center gap-1">
            <Briefcase className="h-3 w-3" />
            {tenant.vertical}
          </span>
        )}
      </div>

      {/* Metrics */}
      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Metric label="Leads MTD" value={String(summary.leadsThisMonth)} />
          <Metric
            label="Pending"
            value={String(summary.pendingActionCount)}
            highlight={summary.pendingActionCount > 0}
          />
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-3">
        <span className="text-xs text-[rgba(255,255,255,0.30)]">
          {lastActivity
            ? `Last activity ${new Date(lastActivity).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
            : summary
              ? "No activity yet"
              : "Health pending"}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-[rgba(255,255,255,0.20)] transition group-hover:text-[#E8913A]" />
      </div>
    </Link>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-[rgba(255,255,255,0.30)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-bold leading-none ${highlight ? "text-[#E8913A]" : "text-[#F5F5F5]"}`}
      >
        {value}
      </p>
    </div>
  );
}
