import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Briefcase } from "lucide-react";

import { StatusDot } from "@/components/execution/StatusPill";
import { AnimatedMark } from "@/components/brand/AnimatedMark";
import type { TenantSummary } from "@/lib/shared/db/repos/tenants.functions";

type Tenant = {
  id: string;
  name: string;
  geo: string;
  vertical: string;
  status: string;
};

export function ClientCommandHeader({
  tenantId,
  tenant,
  summary,
  loading,
}: {
  tenantId: string;
  tenant: Tenant | null;
  summary: TenantSummary | null;
  loading: boolean;
}) {
  const health = summary?.health ?? null;
  const healthTone =
    health === "green" ? "green"
    : health === "red" ? "red"
    : health === "amber" ? "amber"
    : "neutral";

  const goalLabel =
    summary?.growthGoal?.title
      ? summary.growthGoal.title
      : summary?.growthGoal
        ? "Goal active"
        : null;

  return (
    <header className="border-b border-border bg-background px-8 py-6">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        All clients
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            § Client · Command center
          </p>
          <h1 className="mt-2 flex items-center gap-3 truncate font-display text-3xl font-bold tracking-tight text-foreground">
            {loading
              ? <AnimatedMark className="h-6 w-6" speed={1.2} />
              : (tenant?.name ?? "Unknown client")}
          </h1>
          {tenant && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {tenant.geo && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  {tenant.geo}
                </span>
              )}
              {tenant.vertical && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" />
                  {tenant.vertical}
                </span>
              )}
              {health && (
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot tone={healthTone} />
                  {health}
                </span>
              )}
            </div>
          )}
        </div>

        {goalLabel && (
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {goalLabel}
          </p>
        )}
      </div>
    </header>
  );
}
