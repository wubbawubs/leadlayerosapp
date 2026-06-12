import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Briefcase } from "lucide-react";
import { AnimatedMark } from "@/components/brand/AnimatedMark";
import type { TenantSummary } from "@/lib/shared/db/repos/tenants.functions";

type Tenant = {
  id: string;
  name: string;
  geo: string;
  vertical: string;
  status: string;
};

const HEALTH_BADGE: Record<string, string> = {
  green: "bg-[rgba(39,166,68,0.12)] text-[#27A644]",
  amber: "bg-[rgba(232,185,74,0.12)] text-[#E8B94A]",
  red:   "bg-[rgba(229,77,77,0.12)] text-[#E54D4D]",
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

  const goalLabel =
    summary?.growthGoal?.title
      ? summary.growthGoal.title
      : null;

  return (
    <header className="border-b border-[rgba(255,255,255,0.06)] bg-[#0D0E10] px-6 py-5 lg:px-8">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)] transition hover:text-[rgba(255,255,255,0.60)]"
      >
        <ArrowLeft className="h-3 w-3" />
        All clients
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 truncate font-display text-2xl font-bold tracking-tight text-[#F5F5F5]">
            {loading
              ? <AnimatedMark className="h-5 w-5" speed={1.2} />
              : (tenant?.name ?? "Unknown client")}
            {health && (
              <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${HEALTH_BADGE[health] ?? "bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.40)]"}`}>
                {health}
              </span>
            )}
          </h1>

          {tenant && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.30)]">
              {tenant.geo && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />{tenant.geo}
                </span>
              )}
              {tenant.vertical && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" />{tenant.vertical}
                </span>
              )}
            </div>
          )}
        </div>

        {goalLabel && (
          <p className="shrink-0 rounded-[6px] border border-[rgba(255,255,255,0.06)] bg-[#161719] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.40)]">
            {goalLabel}
          </p>
        )}
      </div>
    </header>
  );
}
