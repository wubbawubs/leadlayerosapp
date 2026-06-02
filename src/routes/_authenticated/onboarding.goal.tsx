import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { createGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import { onboardingCopy } from "@/lib/shared/locale/onboarding";

export const Route = createFileRoute("/_authenticated/onboarding/goal")({
  component: GoalStep,
});

const TIMEFRAME_OPTIONS = [3, 6, 12, 18] as const;

function GoalStep() {
  const navigate = useNavigate();
  const t = onboardingCopy.en.goal;
  const createFn = useServerFn(createGrowthGoal);

  const [tenantId, setTenantId] = useState("");
  const [targetCount, setTargetCount] = useState("5");
  const [timeframeMonths, setTimeframeMonths] = useState<number>(6);
  const [leadValue, setLeadValue] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const tid = sessionStorage.getItem("onboarding.tenantId") ?? "";
    setTenantId(tid);
  }, []);

  const m = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Workspace not found — complete setup from the beginning.");
      const count = parseInt(targetCount, 10);
      if (isNaN(count) || count < 1) throw new Error("Enter a valid target count.");

      return createFn({
        data: {
          tenantId,
          input: {
            targetType: "clients",
            targetCount: count,
            timeframeMonths,
            leadValue: leadValue ? parseFloat(leadValue) : null,
            closeRate: 0.3,
            notificationEmail: notificationEmail || null,
            notifyOnLead: !!notificationEmail,
            status: "active",
            source: "operator",
            serviceFocus: [],
            locations: [],
            goodFitLeads: [],
            badFitLeads: [],
          },
        },
      });
    },
    onSuccess: () => proceed(),
    onError: (e) => setErr((e as Error).message),
  });

  function proceed() {
    navigate({ to: "/onboarding/done" });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    m.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border bg-card/70 p-8 backdrop-blur"
    >
      <h1 className="font-display text-3xl text-foreground">{t.title}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t.body}</p>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t.targetLabel}
          </span>
          <input
            type="number"
            min="1"
            max="500"
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            required
            className="w-32 rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t.timeframeLabel}
          </span>
          <div className="flex flex-wrap gap-2">
            {TIMEFRAME_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTimeframeMonths(n)}
                className={`rounded-md border px-4 py-1.5 text-sm font-medium transition ${
                  timeframeMonths === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {t.months(n)}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t.leadValueLabel}
          </span>
          <input
            type="number"
            min="0"
            value={leadValue}
            onChange={(e) => setLeadValue(e.target.value)}
            placeholder="e.g. 1500"
            className="w-48 rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t.leadValueHint}</p>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t.emailLabel}
          </span>
          <input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="client@example.com"
            className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t.emailHint}</p>
        </label>
      </div>

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={m.isPending}
          className="inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {m.isPending ? "Saving…" : t.next}
        </button>
        <button
          type="button"
          onClick={proceed}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.skipLabel} →
        </button>
      </div>
    </form>
  );
}
