import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getActiveGrowthGoal,
  createGrowthGoal,
  updateGrowthGoal,
  syncGrowthGoalToBusinessProfile,
} from "@/lib/shared/growthGoals/repo.functions";
import {
  GROWTH_TARGET_TYPES,
  computeRequiredLeads,
  type GrowthGoal,
  type GrowthGoalInput,
  type GrowthTargetType,
} from "@/lib/shared/growthGoals/schemas";

export const Route = createFileRoute("/_authenticated/settings/growth-goal")({
  component: GrowthGoalPage,
  head: () => ({
    meta: [{ title: "Growth Goal — LeadLayer" }],
  }),
});

type FormState = {
  title: string;
  targetType: GrowthTargetType;
  targetCount: string;
  currentCount: string;
  timeframeMonths: string;
  leadValue: string;
  closeRatePct: string; // UI percent 0..100
  serviceFocus: string;
  locations: string;
  goodFitLeads: string;
  badFitLeads: string;
  capacityNotes: string;
  trackingNotes: string;
  status: "draft" | "active" | "archived";
};

const EMPTY_FORM: FormState = {
  title: "",
  targetType: "clients",
  targetCount: "",
  currentCount: "",
  timeframeMonths: "12",
  leadValue: "",
  closeRatePct: "",
  serviceFocus: "",
  locations: "",
  goodFitLeads: "",
  badFitLeads: "",
  capacityNotes: "",
  trackingNotes: "",
  status: "active",
};

function goalToForm(g: GrowthGoal): FormState {
  const linesOf = (a: string[]) => (a ?? []).join("\n");
  return {
    title: g.title ?? "",
    targetType: g.targetType,
    targetCount: g.targetCount == null ? "" : String(g.targetCount),
    currentCount: g.currentCount == null ? "" : String(g.currentCount),
    timeframeMonths: g.timeframeMonths == null ? "" : String(g.timeframeMonths),
    leadValue: g.leadValue == null ? "" : String(g.leadValue),
    closeRatePct:
      g.closeRate == null ? "" : String(Math.round(g.closeRate * 1000) / 10),
    serviceFocus: linesOf(g.serviceFocus),
    locations: linesOf(g.locations),
    goodFitLeads: linesOf(g.goodFitLeads),
    badFitLeads: linesOf(g.badFitLeads),
    capacityNotes: g.capacityNotes ?? "",
    trackingNotes: g.trackingNotes ?? "",
    status: g.status,
  };
}

function parseLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function num(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

function formToInput(f: FormState): GrowthGoalInput {
  const pct = num(f.closeRatePct);
  return {
    title: f.title,
    targetType: f.targetType,
    targetCount: num(f.targetCount),
    currentCount: num(f.currentCount),
    timeframeMonths:
      f.timeframeMonths.trim() === "" ? null : Math.max(1, Math.min(36, Math.round(Number(f.timeframeMonths)))),
    leadValue: num(f.leadValue),
    closeRate: pct == null ? null : Math.max(0, Math.min(1, pct / 100)),
    serviceFocus: parseLines(f.serviceFocus),
    locations: parseLines(f.locations),
    goodFitLeads: parseLines(f.goodFitLeads),
    badFitLeads: parseLines(f.badFitLeads),
    capacityNotes: f.capacityNotes,
    trackingNotes: f.trackingNotes,
    status: f.status,
    source: "operator",
  };
}

function GrowthGoalPage() {
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchActive = useServerFn(getActiveGrowthGoal);
  const createFn = useServerFn(createGrowthGoal);
  const updateFn = useServerFn(updateGrowthGoal);
  const syncFn = useServerFn(syncGrowthGoalToBusinessProfile);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const goalQuery = useQuery({
    queryKey: ["active-growth-goal", tenantId],
    queryFn: () =>
      tenantId ? fetchActive({ data: { tenantId } }) : Promise.resolve({ goal: null }),
    enabled: !!tenantId,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (goalQuery.data && !loaded) {
      if (goalQuery.data.goal) setForm(goalToForm(goalQuery.data.goal));
      setLoaded(true);
    }
  }, [goalQuery.data, loaded]);

  const requiredLeads = useMemo(() => {
    const pct = num(form.closeRatePct);
    return computeRequiredLeads(num(form.targetCount), pct == null ? null : pct / 100);
  }, [form.targetCount, form.closeRatePct]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active tenant");
      const payload = formToInput(form);
      const existing = goalQuery.data?.goal;
      if (existing) {
        return updateFn({
          data: { tenantId, goalId: existing.id, input: payload },
        });
      }
      return createFn({ data: { tenantId, input: payload } });
    },
    onSuccess: () => {
      toast.success("Growth goal saved");
      qc.invalidateQueries({ queryKey: ["active-growth-goal", tenantId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active tenant");
      const existing = goalQuery.data?.goal;
      if (!existing) throw new Error("Save the goal first");
      return syncFn({ data: { tenantId, goalId: existing.id } });
    },
    onSuccess: (res) => {
      toast.success(
        `Synced ${res.applied.length} field(s) to Business Profile. ${res.warnings.length} skipped.`,
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const goal = goalQuery.data?.goal ?? null;
  const missing = computeMissingContext(form);

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
            <Link to="/settings/business-profile" className="text-muted-foreground hover:text-foreground">
              Business profile
            </Link>
            <span className="font-medium text-foreground">Growth goal</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 pb-24 pt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Sprint · Goal Intake V1
        </p>
        <h1 className="font-display text-4xl text-foreground">Growth goal</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Define the client's concrete growth goal. This drives the Masterplan and all downstream deliverables.
        </p>

        {!tenantId && (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        )}

        {tenantId && (
          <div className="mt-8 space-y-8">
            <Section title="Main goal" subtitle="What does this client want to achieve?">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Title (optional)">
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. 6 new clients per month"
                  />
                </Field>
                <Field label="Target type">
                  <select
                    className="input"
                    value={form.targetType}
                    onChange={(e) =>
                      setForm({ ...form, targetType: e.target.value as GrowthTargetType })
                    }
                  >
                    {GROWTH_TARGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Target per month">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={form.targetCount}
                    onChange={(e) => setForm({ ...form, targetCount: e.target.value })}
                    placeholder="e.g. 6"
                  />
                </Field>
                <Field label="Timeframe (months)">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.timeframeMonths}
                    onChange={(e) => setForm({ ...form, timeframeMonths: e.target.value })}
                  />
                </Field>
                <Field label="Current count per month">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={form.currentCount}
                    onChange={(e) => setForm({ ...form, currentCount: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as FormState["status"],
                      })
                    }
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="Lead economics" subtitle="Used to calculate required leads per month.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Avg. lead value (€)">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={form.leadValue}
                    onChange={(e) => setForm({ ...form, leadValue: e.target.value })}
                  />
                </Field>
                <Field label="Close rate (%)">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={form.closeRatePct}
                    onChange={(e) => setForm({ ...form, closeRatePct: e.target.value })}
                    placeholder="e.g. 40"
                  />
                </Field>
                <Field label="Required leads (calculated)">
                  <div className="input flex items-center bg-background/40 text-muted-foreground">
                    {requiredLeads == null ? "—" : requiredLeads}
                  </div>
                </Field>
              </div>
              {requiredLeads == null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter target and close rate to calculate required leads.
                </p>
              )}
            </Section>

            <Section title="Focus" subtitle="Primary services and target areas — one per line.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Service focus">
                  <textarea
                    className="input min-h-[120px]"
                    value={form.serviceFocus}
                    onChange={(e) => setForm({ ...form, serviceFocus: e.target.value })}
                    placeholder={"AC repair\nHVAC installation\nEmergency heating"}
                  />
                </Field>
                <Field label="Locations">
                  <textarea
                    className="input min-h-[120px]"
                    value={form.locations}
                    onChange={(e) => setForm({ ...form, locations: e.target.value })}
                    placeholder={"Dallas, TX\nDallas metro area"}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Lead quality" subtitle="What makes a good or bad lead for this client?">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Good-fit leads">
                  <textarea
                    className="input min-h-[120px]"
                    value={form.goodFitLeads}
                    onChange={(e) => setForm({ ...form, goodFitLeads: e.target.value })}
                  />
                </Field>
                <Field label="Bad-fit leads">
                  <textarea
                    className="input min-h-[120px]"
                    value={form.badFitLeads}
                    onChange={(e) => setForm({ ...form, badFitLeads: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Capacity & tracking" subtitle="Service capacity and current tracking status.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Capacity notes">
                  <textarea
                    className="input min-h-[100px]"
                    value={form.capacityNotes}
                    onChange={(e) => setForm({ ...form, capacityNotes: e.target.value })}
                  />
                </Field>
                <Field label="Tracking notes">
                  <textarea
                    className="input min-h-[100px]"
                    value={form.trackingNotes}
                    onChange={(e) => setForm({ ...form, trackingNotes: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saveMut.isPending ? "Saving…" : goal ? "Update goal" : "Create goal"}
              </button>
              <button
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending || !goal}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
                title={goal ? "Sync to Business Profile (respects locked fields)" : "Save the goal first"}
              >
                {syncMut.isPending ? "Syncing…" : "Sync to Business Profile"}
              </button>
            </div>

            {goal && <SummaryCard form={form} requiredLeads={requiredLeads} missing={missing} />}

            {syncMut.data && (
              <div className="rounded-lg border border-border bg-card/70 p-5 text-sm">
                <h3 className="font-semibold text-foreground">Sync result</h3>
                <p className="mt-1 text-muted-foreground">
                  Applied: {syncMut.data.applied.length} · Skipped: {syncMut.data.warnings.length}
                </p>
                {syncMut.data.applied.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                    {syncMut.data.applied.map((p) => (
                      <li key={p}>
                        <span className="text-foreground">{p}</span> · synced
                      </li>
                    ))}
                  </ul>
                )}
                {syncMut.data.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                    {syncMut.data.warnings.map((w, i) => (
                      <li key={`${w.fieldPath}-${i}`}>
                        <span className="text-foreground">{w.fieldPath}</span> ·{" "}
                        {w.reason === "locked"
                          ? "field is locked — not overwritten"
                          : w.reason === "already_set"
                            ? "already set — not overwritten"
                            : w.reason === "unchanged"
                              ? "value was already equal"
                              : `error: ${w.detail ?? ""}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      <style>{`
        .input {
          width: 100%;
          border-radius: 6px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background) / 0.6);
          padding: 8px 10px;
          font-size: 14px;
          color: hsl(var(--foreground));
        }
        .input:focus { outline: 2px solid hsl(var(--primary) / 0.4); }
      `}</style>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/70 p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function computeMissingContext(f: FormState): string[] {
  const missing: string[] = [];
  if (!num(f.targetCount)) missing.push("target count missing");
  if (!num(f.closeRatePct)) missing.push("close rate missing");
  if (!num(f.currentCount)) missing.push("current lead flow unknown");
  if (parseLines(f.serviceFocus).length === 0) missing.push("no service focus");
  if (parseLines(f.locations).length === 0) missing.push("no target locations");
  if (!f.trackingNotes.trim()) missing.push("tracking status unknown");
  return missing;
}

function SummaryCard({
  form,
  requiredLeads,
  missing,
}: {
  form: FormState;
  requiredLeads: number | null;
  missing: string[];
}) {
  const tgt = num(form.targetCount);
  const tf = form.timeframeMonths;
  const pct = num(form.closeRatePct);
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 text-sm">
      <h3 className="font-display text-xl text-foreground">Summary</h3>
      <div className="mt-3 space-y-2 text-foreground">
        <p>
          <strong>Goal:</strong>{" "}
          {tgt != null ? `${tgt} ${form.targetType} per month` : "—"}
          {tf ? ` within ${tf} months` : ""}.
        </p>
        <p>
          <strong>Lead math:</strong>{" "}
          {requiredLeads != null && pct != null
            ? `at ${pct}% close rate, approximately ${requiredLeads} qualified leads per month needed.`
            : "unknown — enter target and close rate."}
        </p>
        {parseLines(form.serviceFocus).length > 0 && (
          <p>
            <strong>Focus:</strong> {parseLines(form.serviceFocus).join(", ")}.
          </p>
        )}
        {parseLines(form.locations).length > 0 && (
          <p>
            <strong>Locations:</strong> {parseLines(form.locations).join(", ")}.
          </p>
        )}
        {missing.length > 0 && (
          <div>
            <strong>Missing context:</strong>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
