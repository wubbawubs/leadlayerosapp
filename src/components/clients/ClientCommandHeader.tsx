import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Briefcase } from "lucide-react";

import { StatusDot } from "@/components/execution/StatusPill";

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
  loading,
}: {
  tenantId: string;
  tenant: Tenant | null;
  loading: boolean;
}) {
  return (
    <header className="border-b border-border bg-background px-6 py-5">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        All clients
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {tenant && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-sm font-semibold text-accent-foreground">
                {tenant.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-foreground">
                {loading ? "Loading…" : (tenant?.name ?? "Unknown client")}
              </h1>
              {tenant && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone="neutral" />
                    Health pending wiring
                  </span>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-xs text-muted-foreground">
            Tenant ID:{" "}
            <span className="font-mono text-foreground/70">{tenantId}</span>
          </p>
        </div>
      </div>
    </header>
  );
}
