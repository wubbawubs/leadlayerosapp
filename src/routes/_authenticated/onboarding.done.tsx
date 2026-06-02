import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { onboardingCopy } from "@/lib/shared/locale/onboarding";

export const Route = createFileRoute("/_authenticated/onboarding/done")({
  component: Done,
});

function Done() {
  const t = onboardingCopy.en.done;
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const tid = sessionStorage.getItem("onboarding.tenantId") ?? null;
    setTenantId(tid);
    // Clean up onboarding session storage
    sessionStorage.removeItem("onboarding.tenantId");
    sessionStorage.removeItem("onboarding.siteUrl");
    sessionStorage.removeItem("onboarding.name");
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card/70 p-8 backdrop-blur">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-status-green/30 bg-status-green-soft/20">
        <CheckCircle2 className="h-6 w-6 text-status-green" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        § Setup complete
      </p>
      <h1 className="mt-2 font-display text-4xl text-foreground">{t.title}</h1>
      <p className="mt-3 text-muted-foreground">{t.body}</p>
      {tenantId ? (
        <Link
          to="/clients/$tenantId/overview"
          params={{ tenantId }}
          className="mt-8 inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
        >
          {t.cta}
        </Link>
      ) : (
        <Link
          to="/dashboard"
          className="mt-8 inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
        >
          {t.cta}
        </Link>
      )}
    </div>
  );
}
