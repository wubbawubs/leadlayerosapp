/**
 * /growth/gbp — Manual Google Business Profile review/edit form.
 *
 * GBP Intelligence V1: operator captures profile data manually. The form
 * persists via upsertGbpProfile and re-summarizes via summarizeGbpProfileFn
 * so the Blueprint immediately reflects the new state.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import { getActiveGrowthGoal } from "@/lib/shared/growthGoals/repo.functions";
import {
  getGbpProfile,
  summarizeGbpProfileFn,
  upsertGbpProfile,
} from "@/lib/gbpIntelligence/gbpIntelligence.functions";
import {
  GBP_NAP_STATUSES,
  GBP_PHOTOS_STATUSES,
  GBP_POSTS_STATUSES,
  GBP_SOURCES,
  GBP_STATUSES,
  gbpStatusLabel,
  type GbpProfile,
} from "@/lib/shared/gbpIntelligence/schemas";

export const Route = createFileRoute("/_authenticated/growth/gbp")({
  component: GbpReviewPage,
  head: () => ({
    meta: [{ title: "Google Business Profile — LeadLayer" }],
  }),
});

type FormState = {
  status: (typeof GBP_STATUSES)[number];
  source: (typeof GBP_SOURCES)[number];
  businessName: string;
  profileUrl: string;
  primaryCategory: string;
  secondaryCategories: string;
  rating: string;
  reviewCount: string;
  services: string;
  serviceArea: string;
  address: string;
  phone: string;
  websiteUrl: string;
  photosStatus: (typeof GBP_PHOTOS_STATUSES)[number];
  postsStatus: (typeof GBP_POSTS_STATUSES)[number];
  napConsistency: (typeof GBP_NAP_STATUSES)[number];
  notes: string;
};

const EMPTY_FORM: FormState = {
  status: "manual_review",
  source: "operator_review",
  businessName: "",
  profileUrl: "",
  primaryCategory: "",
  secondaryCategories: "",
  rating: "",
  reviewCount: "",
  services: "",
  serviceArea: "",
  address: "",
  phone: "",
  websiteUrl: "",
  photosStatus: "unknown",
  postsStatus: "unknown",
  napConsistency: "unknown",
  notes: "",
};

const lines = (a: string[]) => (a ?? []).join("\n");
const splitLines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

function profileToForm(p: GbpProfile): FormState {
  return {
    status: p.status,
    source: p.source,
    businessName: p.businessName ?? "",
    profileUrl: p.profileUrl ?? "",
    primaryCategory: p.primaryCategory ?? "",
    secondaryCategories: lines(p.secondaryCategories),
    rating: p.rating == null ? "" : String(p.rating),
    reviewCount: p.reviewCount == null ? "" : String(p.reviewCount),
    services: lines(p.services),
    serviceArea: lines(p.serviceArea),
    address: p.address ?? "",
    phone: p.phone ?? "",
    websiteUrl: p.websiteUrl ?? "",
    photosStatus: p.photosStatus,
    postsStatus: p.postsStatus,
    napConsistency: p.napConsistency,
    notes: p.notes ?? "",
  };
}

function GbpReviewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchGoal = useServerFn(getActiveGrowthGoal);
  const fetchProfile = useServerFn(getGbpProfile);
  const fetchSummary = useServerFn(summarizeGbpProfileFn);
  const upsert = useServerFn(upsertGbpProfile);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants({ data: {} }),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const goalQuery = useQuery({
    queryKey: ["active-growth-goal", tenantId],
    queryFn: () =>
      tenantId ? fetchGoal({ data: { tenantId } }) : Promise.resolve({ goal: null }),
    enabled: !!tenantId,
  });
  const growthGoalId = goalQuery.data?.goal?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ["gbp-profile", tenantId, growthGoalId],
    queryFn: () =>
      tenantId
        ? fetchProfile({ data: { tenantId, growthGoalId } })
        : Promise.resolve({ profile: null }),
    enabled: !!tenantId,
  });
  const summaryQuery = useQuery({
    queryKey: ["gbp-summary", tenantId, growthGoalId],
    queryFn: () =>
      tenantId
        ? fetchSummary({ data: { tenantId, growthGoalId } })
        : Promise.resolve(null),
    enabled: !!tenantId,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    const p = profileQuery.data?.profile;
    if (p) {
      setForm(profileToForm(p));
      setHydrated(true);
    } else if (profileQuery.isFetched) {
      setHydrated(true);
    }
  }, [profileQuery.data, profileQuery.isFetched, hydrated]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async (markReviewed: boolean) => {
      if (!tenantId) throw new Error("No tenant");
      const ratingNum =
        form.rating.trim() === "" ? null : Number(form.rating);
      const reviewCountNum =
        form.reviewCount.trim() === "" ? null : Number(form.reviewCount);
      return upsert({
        data: {
          tenantId,
          growthGoalId: growthGoalId ?? null,
          status: markReviewed ? "reviewed" : form.status,
          source: form.source,
          businessName: form.businessName || null,
          profileUrl: form.profileUrl || null,
          primaryCategory: form.primaryCategory || null,
          secondaryCategories: splitLines(form.secondaryCategories),
          rating:
            ratingNum != null && Number.isFinite(ratingNum) ? ratingNum : null,
          reviewCount:
            reviewCountNum != null && Number.isFinite(reviewCountNum)
              ? Math.round(reviewCountNum)
              : null,
          services: splitLines(form.services),
          serviceArea: splitLines(form.serviceArea),
          address: form.address || null,
          phone: form.phone || null,
          websiteUrl: form.websiteUrl || null,
          photosStatus: form.photosStatus,
          postsStatus: form.postsStatus,
          napConsistency: form.napConsistency,
          notes: form.notes || null,
        },
      });
    },
    onSuccess: (res, markReviewed) => {
      toast.success(markReviewed ? "Marked as reviewed" : "GBP profile saved");
      if (res?.profile) setForm(profileToForm(res.profile));
      qc.invalidateQueries({ queryKey: ["gbp-profile", tenantId] });
      qc.invalidateQueries({ queryKey: ["gbp-summary", tenantId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    },
  });

  const summary = summaryQuery.data?.summary;

  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link
              to="/growth/blueprint"
              className="text-muted-foreground hover:text-foreground"
            >
              Blueprint
            </Link>
            <span className="font-medium text-foreground">GBP</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 pb-24 pt-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Google Business Profile
            </p>
            <h1 className="mt-1 font-display text-2xl text-foreground">
              Manual GBP review
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Capture what you see on the live Google Business Profile. The
              Blueprint uses this to score local trust and visibility. No data
              is pulled from Google automatically in V1.
            </p>
          </div>
          <Link
            to="/growth/blueprint"
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Back to Blueprint
          </Link>
        </div>

        {summary && (
          <section className="mb-6 grid gap-3 rounded-lg border border-border bg-card/60 p-4 sm:grid-cols-4">
            <ScoreTile label="Status" value={gbpStatusLabel(summary.status)} />
            <ScoreTile label="Completeness" value={`${summary.completenessScore}/100`} />
            <ScoreTile label="Trust" value={`${summary.trustScore}/100`} />
            <ScoreTile
              label="Local visibility"
              value={`${summary.localVisibilityScore}/100`}
            />
          </section>
        )}

        {summary && summary.warnings.length > 0 && (
          <div className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            {summary.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        {!tenantId ? (
          <p className="text-muted-foreground">Loading tenant…</p>
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(false);
            }}
          >
            <fieldset className="grid gap-4 rounded-lg border border-border bg-card/50 p-5">
              <legend className="px-2 text-sm font-medium text-foreground">
                Status
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Profile status">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      set("status", e.target.value as FormState["status"])
                    }
                  >
                    {GBP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {gbpStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Data source">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.source}
                    onChange={(e) =>
                      set("source", e.target.value as FormState["source"])
                    }
                  >
                    {GBP_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border border-border bg-card/50 p-5">
              <legend className="px-2 text-sm font-medium text-foreground">
                Identity
              </legend>
              <Field label="Business name">
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.businessName}
                  onChange={(e) => set("businessName", e.target.value)}
                />
              </Field>
              <Field label="Profile URL">
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.profileUrl}
                  onChange={(e) => set("profileUrl", e.target.value)}
                  placeholder="https://g.page/…"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Primary category">
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.primaryCategory}
                    onChange={(e) => set("primaryCategory", e.target.value)}
                    placeholder="e.g. HVAC contractor"
                  />
                </Field>
                <Field label="Secondary categories (one per line)">
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.secondaryCategories}
                    onChange={(e) =>
                      set("secondaryCategories", e.target.value)
                    }
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border border-border bg-card/50 p-5">
              <legend className="px-2 text-sm font-medium text-foreground">
                Reviews
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Average rating (0–5)">
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={5}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.rating}
                    onChange={(e) => set("rating", e.target.value)}
                    placeholder="Leave blank if unknown"
                  />
                </Field>
                <Field label="Review count">
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.reviewCount}
                    onChange={(e) => set("reviewCount", e.target.value)}
                    placeholder="Leave blank if unknown"
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Only enter numbers you can verify on the live profile. Empty =
                unknown (Blueprint treats this honestly).
              </p>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border border-border bg-card/50 p-5">
              <legend className="px-2 text-sm font-medium text-foreground">
                Services & area
              </legend>
              <Field label="Services (one per line)">
                <textarea
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.services}
                  onChange={(e) => set("services", e.target.value)}
                />
              </Field>
              <Field label="Service area (one per line)">
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.serviceArea}
                  onChange={(e) => set("serviceArea", e.target.value)}
                />
              </Field>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border border-border bg-card/50 p-5">
              <legend className="px-2 text-sm font-medium text-foreground">
                Contact
              </legend>
              <Field label="Address">
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone">
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </Field>
                <Field label="Website URL">
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.websiteUrl}
                    onChange={(e) => set("websiteUrl", e.target.value)}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border border-border bg-card/50 p-5">
              <legend className="px-2 text-sm font-medium text-foreground">
                Activity & consistency
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Photos">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.photosStatus}
                    onChange={(e) =>
                      set("photosStatus", e.target.value as FormState["photosStatus"])
                    }
                  >
                    {GBP_PHOTOS_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Posts">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.postsStatus}
                    onChange={(e) =>
                      set("postsStatus", e.target.value as FormState["postsStatus"])
                    }
                  >
                    {GBP_POSTS_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="NAP consistency">
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.napConsistency}
                    onChange={(e) =>
                      set(
                        "napConsistency",
                        e.target.value as FormState["napConsistency"],
                      )
                    }
                  >
                    {GBP_NAP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </fieldset>

            {summary && (summary.gaps.length > 0 || summary.recommendations.length > 0) && (
              <section className="grid gap-4 rounded-lg border border-border bg-card/50 p-5 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Gaps</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {summary.gaps.map((g) => (
                      <li key={g.code}>
                        • {g.label}
                        {g.detail ? <span className="opacity-70"> — {g.detail}</span> : null}
                      </li>
                    ))}
                    {summary.gaps.length === 0 && <li>No structural gaps detected.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">Recommendations</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {summary.recommendations.map((r) => (
                      <li key={r.code}>
                        • {r.title}
                        {r.detail ? <span className="opacity-70"> — {r.detail}</span> : null}
                      </li>
                    ))}
                    {summary.recommendations.length === 0 && (
                      <li>No additional recommendations.</li>
                    )}
                  </ul>
                </div>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={save.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(true)}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                Save & mark reviewed
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/growth/blueprint" })}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ScoreTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-lg text-foreground">{value}</p>
    </div>
  );
}
