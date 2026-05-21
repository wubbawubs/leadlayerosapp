import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { TenantSwitcher } from "@/components/app/TenantSwitcher";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getBusinessProfileV2,
  upsertBusinessProfileV2,
  setBusinessProfileStatus,
  lockBusinessProfileField,
  listBusinessProfileSuggestions,
  acceptBusinessProfileSuggestion,
  rejectBusinessProfileSuggestion,
  editAndAcceptBusinessProfileSuggestion,
  analyzeBusinessProfileFromWebsiteFn,
} from "@/lib/shared/businessProfile/repo.functions";
import {
  BusinessProfileSchema,
  type BusinessProfile,
  type StrategyAngle,
  type MissingContextItem,
} from "@/lib/shared/businessProfile/schemas";

export const Route = createFileRoute("/_authenticated/settings/business-profile")({
  component: BusinessProfilePage,
});

const EMPTY = BusinessProfileSchema.parse({});

type Status = "draft" | "review_ready" | "approved" | "locked";

interface Suggestion {
  id: string;
  section: string;
  field_path: string;
  suggested_value: unknown;
  current_value: unknown;
  source_evidence: Array<{ url?: string; quote?: string; reason?: string }>;
  confidence: number;
  rationale: string;
  status: string;
}

function splitLines(s: string): string[] {
  return s.split("\n").map((l) => l.trim()).filter(Boolean);
}
function joinLines(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.filter((x) => typeof x === "string").join("\n");
}

function BusinessProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchProfile = useServerFn(getBusinessProfileV2);
  const save = useServerFn(upsertBusinessProfileV2);
  const setStatus = useServerFn(setBusinessProfileStatus);
  const lockField = useServerFn(lockBusinessProfileField);
  const fetchSuggestions = useServerFn(listBusinessProfileSuggestions);
  const acceptSuggestion = useServerFn(acceptBusinessProfileSuggestion);
  const rejectSuggestion = useServerFn(rejectBusinessProfileSuggestion);
  const editAcceptSuggestion = useServerFn(editAndAcceptBusinessProfileSuggestion);
  const analyzeFromWebsite = useServerFn(analyzeBusinessProfileFromWebsiteFn);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenants = tenantsQuery.data?.tenants ?? [];
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    if (!tenants.length) return;
    const stored =
      typeof window !== "undefined" ? localStorage.getItem("ll.activeTenantId") : null;
    setTenantId(tenants.find((t) => t.id === stored)?.id ?? tenants[0].id);
  }, [tenants]);

  const profileQuery = useQuery({
    queryKey: ["business-profile-v2", tenantId],
    queryFn: () => fetchProfile({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const row = profileQuery.data?.profile as Record<string, unknown> | null | undefined;
  const status: Status = (row?.status as Status) ?? "draft";
  const confidence: number = Number(row?.confidence_score ?? 0);
  const locked: string[] = Array.isArray(row?.locked_fields)
    ? (row!.locked_fields as string[])
    : [];

  const [profile, setProfile] = useState<BusinessProfile>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!row) {
      setProfile(EMPTY);
      return;
    }
    const merged = BusinessProfileSchema.parse({
      ...EMPTY,
      business_identity: row.business_identity ?? {},
      offer_profile: row.offer_profile ?? {},
      icp_profile: row.icp_profile ?? {},
      location_profile: row.location_profile ?? {},
      conversion_profile: row.conversion_profile ?? {},
      proof_profile: row.proof_profile ?? {},
      claim_guardrails: row.claim_guardrails ?? {},
      strategy_angles: row.strategy_angles ?? [],
      missing_context: row.missing_context ?? [],
      locked_fields: row.locked_fields ?? [],
    });
    setProfile(merged);
  }, [profileQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async (newStatus?: Status) => {
      if (!tenantId) throw new Error("Geen tenant");
      return save({ data: { tenantId, patch: profile, status: newStatus } });
    },
    onSuccess: () => {
      setMsg("Opgeslagen.");
      qc.invalidateQueries({ queryKey: ["business-profile-v2", tenantId] });
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e) => setMsg(`Fout: ${(e as Error).message}`),
  });

  const statusMutation = useMutation({
    mutationFn: async (s: Status) => {
      if (!tenantId) throw new Error("Geen tenant");
      return setStatus({ data: { tenantId, status: s } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-profile-v2", tenantId] }),
  });

  const lockMutation = useMutation({
    mutationFn: async (input: { fieldPath: string; lock: boolean }) => {
      if (!tenantId) throw new Error("Geen tenant");
      return lockField({ data: { tenantId, ...input } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-profile-v2", tenantId] }),
  });

  // BP-2: suggestions
  const suggestionsQuery = useQuery({
    queryKey: ["bp-suggestions", tenantId],
    queryFn: () => fetchSuggestions({ data: { tenantId: tenantId!, status: "pending" } }),
    enabled: !!tenantId,
  });
  const suggestions = (suggestionsQuery.data?.suggestions ?? []) as Suggestion[];

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Geen tenant");
      return analyzeFromWebsite({ data: { tenantId } });
    },
    onSuccess: (r) => {
      setMsg(
        `Analyzer klaar: ${r.suggestionsCreated} suggesties (${r.observedPages} pagina's geanalyseerd, ${r.blockedByLock} geblokkeerd door lock).`,
      );
      qc.invalidateQueries({ queryKey: ["bp-suggestions", tenantId] });
      qc.invalidateQueries({ queryKey: ["business-profile-v2", tenantId] });
    },
    onError: (e) => setMsg(`Analyzer fout: ${(e as Error).message}`),
  });

  const acceptMutation = useMutation({
    mutationFn: async (input: { suggestionId: string; lockAfter?: boolean }) => {
      if (!tenantId) throw new Error("Geen tenant");
      return acceptSuggestion({ data: { tenantId, ...input } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bp-suggestions", tenantId] });
      qc.invalidateQueries({ queryKey: ["business-profile-v2", tenantId] });
    },
    onError: (e) => setMsg(`Accept fout: ${(e as Error).message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      if (!tenantId) throw new Error("Geen tenant");
      return rejectSuggestion({ data: { tenantId, suggestionId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bp-suggestions", tenantId] }),
  });

  const editAcceptMutation = useMutation({
    mutationFn: async (input: { suggestionId: string; editedValue: unknown }) => {
      if (!tenantId) throw new Error("Geen tenant");
      return editAcceptSuggestion({ data: { tenantId, ...input } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bp-suggestions", tenantId] });
      qc.invalidateQueries({ queryKey: ["business-profile-v2", tenantId] });
    },
    onError: (e) => setMsg(`Edit fout: ${(e as Error).message}`),
  });

  const isLocked = (path: string) => locked.includes(path);

  // ----- field setters -----
  function patchIdentity<K extends keyof BusinessProfile["business_identity"]>(
    k: K,
    v: BusinessProfile["business_identity"][K],
  ) {
    setProfile((p) => ({ ...p, business_identity: { ...p.business_identity, [k]: v } }));
  }
  function patchOffer<K extends keyof BusinessProfile["offer_profile"]>(
    k: K,
    v: BusinessProfile["offer_profile"][K],
  ) {
    setProfile((p) => ({ ...p, offer_profile: { ...p.offer_profile, [k]: v } }));
  }
  function patchIcp<K extends keyof BusinessProfile["icp_profile"]>(
    k: K,
    v: BusinessProfile["icp_profile"][K],
  ) {
    setProfile((p) => ({ ...p, icp_profile: { ...p.icp_profile, [k]: v } }));
  }
  function patchLocation<K extends keyof BusinessProfile["location_profile"]>(
    k: K,
    v: BusinessProfile["location_profile"][K],
  ) {
    setProfile((p) => ({ ...p, location_profile: { ...p.location_profile, [k]: v } }));
  }
  function patchConversion<K extends keyof BusinessProfile["conversion_profile"]>(
    k: K,
    v: BusinessProfile["conversion_profile"][K],
  ) {
    setProfile((p) => ({ ...p, conversion_profile: { ...p.conversion_profile, [k]: v } }));
  }
  function patchProof<K extends keyof BusinessProfile["proof_profile"]>(
    k: K,
    v: BusinessProfile["proof_profile"][K],
  ) {
    setProfile((p) => ({ ...p, proof_profile: { ...p.proof_profile, [k]: v } }));
  }
  function patchGuard<K extends keyof BusinessProfile["claim_guardrails"]>(
    k: K,
    v: BusinessProfile["claim_guardrails"][K],
  ) {
    setProfile((p) => ({ ...p, claim_guardrails: { ...p.claim_guardrails, [k]: v } }));
  }

  const id = profile.business_identity;
  const offer = profile.offer_profile;
  const icp = profile.icp_profile;
  const loc = profile.location_profile;
  const conv = profile.conversion_profile;
  const proof = profile.proof_profile;
  const guard = profile.claim_guardrails;

  const sectionsConfidence = useMemo(() => {
    const cm = (row?.confidence_map ?? {}) as Record<string, number>;
    return {
      identity: cm.business_identity ?? 0,
      offer: cm.offer_profile ?? 0,
      icp: cm.icp_profile ?? 0,
      location: cm.location_profile ?? 0,
      conversion: cm.conversion_profile ?? 0,
      proof: cm.proof_profile ?? 0,
      claims: cm.claim_guardrails ?? 0,
    };
  }, [row]);

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
            <span className="text-foreground font-medium">Business profile</span>
            <Link
              to="/settings/tone-profile"
              className="text-muted-foreground hover:text-foreground"
            >
              Tone profile
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {tenants.length > 0 && <TenantSwitcher tenants={tenants} />}
          <button
            onClick={() => navigate({ to: "/app" })}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Back
          </button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 pb-24 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Growth Intelligence Profile
        </p>
        <h1 className="font-display text-4xl text-foreground">Business profile</h1>
        <p className="mt-2 text-muted-foreground">
          De centrale strategielaag waar proposals, landingspagina&apos;s, CTA&apos;s en
          reports straks op draaien. Vul in, laat AI aanvullen, lock wat zeker is.
        </p>

        {/* Top status bar */}
        <div className="mt-6 rounded-lg border border-border bg-card/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={status} />
              <ConfidenceChip label="Overall" score={confidence} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending || !tenantId}
                className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
                title="AI analyseert geauditeerde pagina's en stelt invullingen voor"
              >
                {analyzeMutation.isPending ? "Analyseren…" : "Generate from website"}
              </button>
              <button
                onClick={() => saveMutation.mutate(undefined)}
                disabled={saveMutation.isPending || !tenantId}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saveMutation.isPending ? "Opslaan…" : "Save profile"}
              </button>
              <button
                onClick={() => statusMutation.mutate("review_ready")}
                disabled={statusMutation.isPending}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Mark review-ready
              </button>
              <button
                onClick={() => statusMutation.mutate("approved")}
                disabled={statusMutation.isPending}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Approve
              </button>
              <button
                onClick={() => statusMutation.mutate("locked")}
                disabled={statusMutation.isPending}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Lock
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <ConfidenceChip label="Identity" score={sectionsConfidence.identity} />
            <ConfidenceChip label="Offer" score={sectionsConfidence.offer} />
            <ConfidenceChip label="ICP" score={sectionsConfidence.icp} />
            <ConfidenceChip label="Location" score={sectionsConfidence.location} />
            <ConfidenceChip label="Conversion" score={sectionsConfidence.conversion} />
            <ConfidenceChip label="Proof" score={sectionsConfidence.proof} />
            <ConfidenceChip label="Claims" score={sectionsConfidence.claims} />
          </div>
          {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        </div>

        {locked.length > 0 && (
          <div className="mt-4 rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Locked velden:</span>{" "}
            {locked.join(", ")}
          </div>
        )}

        {/* BP-2: AI Suggestions */}
        <SuggestionsPanel
          suggestions={suggestions}
          onAccept={(id, lockAfter) => acceptMutation.mutate({ suggestionId: id, lockAfter })}
          onReject={(id) => rejectMutation.mutate(id)}
          onEditAccept={(id, v) => editAcceptMutation.mutate({ suggestionId: id, editedValue: v })}
          pending={
            acceptMutation.isPending || rejectMutation.isPending || editAcceptMutation.isPending
          }
        />

        {/* 1. Identity */}
        <Section
          title="1. Business identity"
          desc="Basiscontext — wordt gebruikt voor schema, tone, reports en proposals."
        >
          <Field label="Bedrijfsnaam" path="business_identity.businessName" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={id.businessName ?? ""} onChange={(v) => patchIdentity("businessName", v)} />
          </Field>
          <Field label="Brandnaam (optioneel)" path="business_identity.brandName" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={id.brandName ?? ""} onChange={(v) => patchIdentity("brandName", v)} />
          </Field>
          <Field label="Branche" path="business_identity.industry" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={id.industry ?? ""} onChange={(v) => patchIdentity("industry", v)} />
          </Field>
          <Field label="Vertical" path="business_identity.vertical" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={id.vertical ?? ""} onChange={(v) => patchIdentity("vertical", v)} />
          </Field>
          <Field label="Type" path="business_identity.businessType" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Select
              value={id.businessType ?? "other"}
              onChange={(v) => patchIdentity("businessType", v as typeof id.businessType)}
              options={[
                ["local_service", "Local service"],
                ["ecommerce", "E-commerce"],
                ["b2b_service", "B2B service"],
                ["professional_service", "Professional service"],
                ["other", "Other"],
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Taal" path="business_identity.language" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
              <Input value={id.language ?? "nl"} onChange={(v) => patchIdentity("language", v)} />
            </Field>
            <Field label="Land" path="business_identity.country" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
              <Input value={id.country ?? "NL"} onChange={(v) => patchIdentity("country", v)} />
            </Field>
          </div>
          <Field label="Website" path="business_identity.websiteUrl" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={id.websiteUrl ?? ""} onChange={(v) => patchIdentity("websiteUrl", v)} />
          </Field>
          <Field label="Korte beschrijving" path="business_identity.shortDescription" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={id.shortDescription ?? ""} onChange={(v) => patchIdentity("shortDescription", v)} rows={2} />
          </Field>
          <Field label="Maturity" path="business_identity.maturity" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Select
              value={id.maturity ?? "unknown"}
              onChange={(v) => patchIdentity("maturity", v as typeof id.maturity)}
              options={[
                ["new", "New"],
                ["growing", "Growing"],
                ["established", "Established"],
                ["unknown", "Unknown"],
              ]}
            />
          </Field>
        </Section>

        {/* 2. Offer */}
        <Section title="2. Offer profile" desc="Wat verkoopt dit bedrijf, en wat mag het veilig beloven?">
          <Field label="Primair aanbod (1 zin)" path="offer_profile.primaryOffer" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={offer.primaryOffer ?? ""} onChange={(v) => patchOffer("primaryOffer", v)} />
          </Field>
          <Field label="Secundair aanbod" hint="Eén per regel" path="offer_profile.secondaryOffers" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(offer.secondaryOffers)} onChange={(v) => patchOffer("secondaryOffers", splitLines(v))} rows={3} />
          </Field>
          <Field label="High-value offers" hint="Eén per regel" path="offer_profile.highValueOffers" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(offer.highValueOffers)} onChange={(v) => patchOffer("highValueOffers", splitLines(v))} rows={2} />
          </Field>
          <Field label="Low-priority offers" hint="Eén per regel" path="offer_profile.lowPriorityOffers" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(offer.lowPriorityOffers)} onChange={(v) => patchOffer("lowPriorityOffers", splitLines(v))} rows={2} />
          </Field>
          <Field label="Offer mechanism (hoe werkt het?)" path="offer_profile.offerMechanism" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={offer.offerMechanism ?? ""} onChange={(v) => patchOffer("offerMechanism", v)} rows={2} />
          </Field>
          <Field label="Main promise" path="offer_profile.mainPromise" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={offer.mainPromise ?? ""} onChange={(v) => patchOffer("mainPromise", v)} />
          </Field>
          <Field label="Safe promise (wat mag je veilig zeggen)" path="offer_profile.safePromise" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={offer.safePromise ?? ""} onChange={(v) => patchOffer("safePromise", v)} />
          </Field>
          <Field label="Unique value proposition" path="offer_profile.uniqueValueProposition" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={offer.uniqueValueProposition ?? ""} onChange={(v) => patchOffer("uniqueValueProposition", v)} rows={2} />
          </Field>
          <Field label="Prijscontext" path="offer_profile.pricingContext" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={offer.pricingContext ?? ""} onChange={(v) => patchOffer("pricingContext", v)} />
          </Field>
          <Field label="Capaciteit / constraints" path="offer_profile.capacityConstraints" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={offer.capacityConstraints ?? ""} onChange={(v) => patchOffer("capacityConstraints", v)} />
          </Field>
          <Field label="Offer maturity" path="offer_profile.offerMaturity" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Select
              value={offer.offerMaturity ?? "unclear"}
              onChange={(v) => patchOffer("offerMaturity", v as typeof offer.offerMaturity)}
              options={[
                ["unclear", "Unclear"],
                ["basic", "Basic"],
                ["strong", "Strong"],
              ]}
            />
          </Field>
        </Section>

        {/* 3. ICP */}
        <Section title="3. ICP profile" desc="Voor wie optimaliseren we — en voor wie juist niet.">
          <Field label="Ideale klanten" hint="Eén per regel" path="icp_profile.idealCustomers" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.idealCustomers)} onChange={(v) => patchIcp("idealCustomers", splitLines(v))} rows={3} />
          </Field>
          <Field label="Best-fit segmenten" hint="Eén per regel" path="icp_profile.bestFitSegments" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.bestFitSegments)} onChange={(v) => patchIcp("bestFitSegments", splitLines(v))} rows={2} />
          </Field>
          <Field label="Bad-fit segmenten" hint="Eén per regel" path="icp_profile.badFitSegments" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.badFitSegments)} onChange={(v) => patchIcp("badFitSegments", splitLines(v))} rows={2} />
          </Field>
          <Field label="Pijnpunten" hint="Eén per regel" path="icp_profile.painPoints" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.painPoints)} onChange={(v) => patchIcp("painPoints", splitLines(v))} rows={3} />
          </Field>
          <Field label="Buying triggers" hint="Eén per regel" path="icp_profile.buyingTriggers" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.buyingTriggers)} onChange={(v) => patchIcp("buyingTriggers", splitLines(v))} rows={2} />
          </Field>
          <Field label="Bezwaren" hint="Eén per regel" path="icp_profile.objections" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.objections)} onChange={(v) => patchIcp("objections", splitLines(v))} rows={2} />
          </Field>
          <Field label="Beslissingscriteria" hint="Eén per regel" path="icp_profile.decisionCriteria" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.decisionCriteria)} onChange={(v) => patchIcp("decisionCriteria", splitLines(v))} rows={2} />
          </Field>
          <Field label="Gewenste lead-types" hint="Eén per regel" path="icp_profile.desiredLeadTypes" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.desiredLeadTypes)} onChange={(v) => patchIcp("desiredLeadTypes", splitLines(v))} rows={2} />
          </Field>
          <Field label="Ongewenste lead-types" hint="Eén per regel" path="icp_profile.undesiredLeadTypes" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(icp.undesiredLeadTypes)} onChange={(v) => patchIcp("undesiredLeadTypes", splitLines(v))} rows={2} />
          </Field>
        </Section>

        {/* 4. Location */}
        <Section title="4. Location profile" desc="Werkgebieden en lokale kansen — gebruikt door schema en local SEO.">
          <Field label="Hoofdvestiging / primaire locatie" path="location_profile.primaryLocation" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={loc.primaryLocation ?? ""} onChange={(v) => patchLocation("primaryLocation", v)} />
          </Field>
          <Field label="Werkgebieden" hint="Eén per regel" path="location_profile.serviceAreas" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(loc.serviceAreas)} onChange={(v) => patchLocation("serviceAreas", splitLines(v))} rows={3} />
          </Field>
          <Field label="Uitgesloten gebieden" hint="Eén per regel" path="location_profile.excludedAreas" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(loc.excludedAreas)} onChange={(v) => patchLocation("excludedAreas", splitLines(v))} rows={2} />
          </Field>
          <Field label="Region type" path="location_profile.regionType" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Select
              value={loc.regionType ?? "unknown"}
              onChange={(v) => patchLocation("regionType", v as typeof loc.regionType)}
              options={[
                ["city", "City"],
                ["region", "Region"],
                ["province", "Province / State"],
                ["national", "National"],
                ["multi_location", "Multi-location"],
                ["unknown", "Unknown"],
              ]}
            />
          </Field>
          <Field label="Local search patterns" hint='Bv. "kapper amsterdam", "near me"' path="location_profile.localSearchPatterns" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(loc.localSearchPatterns)} onChange={(v) => patchLocation("localSearchPatterns", splitLines(v))} rows={2} />
          </Field>
          <Field label="Location page opportunities" hint="Eén per regel" path="location_profile.locationPageOpportunities" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(loc.locationPageOpportunities)} onChange={(v) => patchLocation("locationPageOpportunities", splitLines(v))} rows={2} />
          </Field>
        </Section>

        {/* 5. Conversion */}
        <Section title="5. Conversion profile" desc="Wat moet de site opleveren? Maakt proposals commercieel slimmer.">
          <Field label="Primaire CTA" path="conversion_profile.primaryCta" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={conv.primaryCta ?? ""} onChange={(v) => patchConversion("primaryCta", v)} />
          </Field>
          <Field label="Secundaire CTA" path="conversion_profile.secondaryCta" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={conv.secondaryCta ?? ""} onChange={(v) => patchConversion("secondaryCta", v)} />
          </Field>
          <Field label="Voorkeurs-contactmethode" path="conversion_profile.preferredContactMethod" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Input value={conv.preferredContactMethod ?? ""} onChange={(v) => patchConversion("preferredContactMethod", v)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Lead value (€)" path="conversion_profile.leadValueEstimate" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
              <NumberInput value={conv.leadValueEstimate ?? null} onChange={(v) => patchConversion("leadValueEstimate", v)} />
            </Field>
            <Field label="Close rate (%)" path="conversion_profile.closeRateEstimate" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
              <NumberInput value={conv.closeRateEstimate ?? null} onChange={(v) => patchConversion("closeRateEstimate", v)} />
            </Field>
            <Field label="Maandelijkse capaciteit" path="conversion_profile.monthlyCapacity" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
              <NumberInput value={conv.monthlyCapacity ?? null} onChange={(v) => patchConversion("monthlyCapacity", v)} />
            </Field>
          </div>
          <Field label="Sales process" path="conversion_profile.salesProcess" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={conv.salesProcess ?? ""} onChange={(v) => patchConversion("salesProcess", v)} rows={2} />
          </Field>
          <Field label="Conversion barriers" hint="Eén per regel" path="conversion_profile.conversionBarriers" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(conv.conversionBarriers)} onChange={(v) => patchConversion("conversionBarriers", splitLines(v))} rows={2} />
          </Field>
          <Field label="Trust-elementen die nog ontbreken" hint="Eén per regel" path="conversion_profile.trustElementsNeeded" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(conv.trustElementsNeeded)} onChange={(v) => patchConversion("trustElementsNeeded", splitLines(v))} rows={2} />
          </Field>
        </Section>

        {/* 6. Proof */}
        <Section title="6. Proof profile" desc="Verified vs unverified bewijs. Unverified mag de proposal engine niet hard claimen.">
          <Field label="Verified proof points" hint="Eén per regel — cijfers, cases, certificeringen mét bron" path="proof_profile.verifiedProofPoints" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(proof.verifiedProofPoints)} onChange={(v) => patchProof("verifiedProofPoints", splitLines(v))} rows={3} />
          </Field>
          <Field label="Unverified proof points" hint="Eén per regel — claims zonder bron" path="proof_profile.unverifiedProofPoints" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(proof.unverifiedProofPoints)} onChange={(v) => patchProof("unverifiedProofPoints", splitLines(v))} rows={2} />
          </Field>
          <Field label="Proof gaps" hint="Eén per regel — waar mist bewijs?" path="proof_profile.proofGaps" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(proof.proofGaps)} onChange={(v) => patchProof("proofGaps", splitLines(v))} rows={2} />
          </Field>
          <Field label="Reviews / signalen" hint="Eén per regel" path="proof_profile.reviewSignals" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(proof.reviewSignals)} onChange={(v) => patchProof("reviewSignals", splitLines(v))} rows={2} />
          </Field>
          <Field label="Case studies" hint="Eén per regel" path="proof_profile.caseStudySignals" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(proof.caseStudySignals)} onChange={(v) => patchProof("caseStudySignals", splitLines(v))} rows={2} />
          </Field>
          <Field label="Certificeringen" hint="Eén per regel" path="proof_profile.certifications" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(proof.certifications)} onChange={(v) => patchProof("certifications", splitLines(v))} rows={2} />
          </Field>
          <Field label="Jaren ervaring" path="proof_profile.yearsExperience" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <NumberInput value={proof.yearsExperience ?? null} onChange={(v) => patchProof("yearsExperience", v)} />
          </Field>
        </Section>

        {/* 7. Claim guardrails */}
        <Section title="7. Claim guardrails" desc="Welke claims mogen wel, welke niet. Forbidden claims blokkeren proposals.">
          <Field label="Allowed claims" hint="Eén per regel" path="claim_guardrails.allowedClaims" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(guard.allowedClaims)} onChange={(v) => patchGuard("allowedClaims", splitLines(v))} rows={3} />
          </Field>
          <Field label="Risky claims" hint="Eén per regel" path="claim_guardrails.riskyClaims" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(guard.riskyClaims)} onChange={(v) => patchGuard("riskyClaims", splitLines(v))} rows={2} />
          </Field>
          <Field label="Forbidden claims" hint='Bv. "gegarandeerd #1 in Google"' path="claim_guardrails.forbiddenClaims" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(guard.forbiddenClaims)} onChange={(v) => patchGuard("forbiddenClaims", splitLines(v))} rows={2} />
          </Field>
          <Field label="Compliance / juridische notes" hint="Eén per regel" path="claim_guardrails.complianceNotes" isLocked={isLocked} onLock={(p, l) => lockMutation.mutate({ fieldPath: p, lock: l })}>
            <Textarea value={joinLines(guard.complianceNotes)} onChange={(v) => patchGuard("complianceNotes", splitLines(v))} rows={2} />
          </Field>
        </Section>

        {/* 8. Strategy angles */}
        <Section title="8. Strategy angles" desc="Commerciële invalshoeken die de Proposal Engine en Monthly Planner gebruiken.">
          <StrategyAngles
            angles={profile.strategy_angles}
            onChange={(angles) => setProfile((p) => ({ ...p, strategy_angles: angles }))}
          />
        </Section>

        {/* 9. Missing context */}
        <Section title="9. Missing context" desc="Eerlijk: wat weet het systeem niet? Wordt later AI-gevuld; nu handmatig.">
          <MissingContext
            items={profile.missing_context}
            onChange={(items) => setProfile((p) => ({ ...p, missing_context: items }))}
          />
        </Section>

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate(undefined)}
            disabled={saveMutation.isPending || !tenantId}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Opslaan…" : "Save profile"}
          </button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </main>
    </div>
  );
}

// ---------------- presentational ----------------

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    draft: "bg-muted text-muted-foreground",
    review_ready: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    locked: "bg-primary/15 text-primary",
  };
  const label: Record<Status, string> = {
    draft: "draft",
    review_ready: "review-ready",
    approved: "approved",
    locked: "locked",
  };
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function ConfidenceChip({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(10, Number(score) || 0));
  const tone =
    pct >= 7
      ? "text-emerald-700 dark:text-emerald-300"
      : pct >= 4
      ? "text-amber-700 dark:text-amber-300"
      : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${tone}`}>{pct.toFixed(1)}/10</span>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-lg border border-border bg-card/70 p-5">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  path,
  isLocked,
  onLock,
  children,
}: {
  label: string;
  hint?: string;
  path: string;
  isLocked: (p: string) => boolean;
  onLock: (p: string, lock: boolean) => void;
  children: React.ReactNode;
}) {
  const locked = isLocked(path);
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <button
          type="button"
          onClick={() => onLock(path, !locked)}
          className={`text-xs ${locked ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          title={locked ? "Unlock" : "Lock (AI mag niet overschrijven)"}
        >
          {locked ? "🔒 locked" : "🔓 lock"}
        </button>
      </span>
      {hint && <span className="mb-1 block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
}

function Textarea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function StrategyAngles({
  angles,
  onChange,
}: {
  angles: StrategyAngle[];
  onChange: (a: StrategyAngle[]) => void;
}) {
  function update(i: number, patch: Partial<StrategyAngle>) {
    onChange(angles.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function remove(i: number) {
    onChange(angles.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...angles, { angle: "", score: 5, why: "", bestFor: [], riskLevel: "low" }]);
  }
  return (
    <div className="space-y-3">
      {angles.length === 0 && (
        <p className="text-sm text-muted-foreground">Nog geen angles. Voeg er één toe of laat AI suggereren (BP-2).</p>
      )}
      {angles.map((a, i) => (
        <div key={i} className="rounded-md border border-border bg-background p-3">
          <div className="grid grid-cols-[1fr_80px_120px_auto] items-start gap-2">
            <Input value={a.angle} onChange={(v) => update(i, { angle: v })} placeholder="Angle (1 zin)" />
            <NumberInput value={a.score ?? 5} onChange={(v) => update(i, { score: v ?? 5 })} />
            <Select
              value={a.riskLevel ?? "low"}
              onChange={(v) => update(i, { riskLevel: v as StrategyAngle["riskLevel"] })}
              options={[
                ["low", "Low risk"],
                ["medium", "Medium risk"],
                ["high", "High risk"],
              ]}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            >
              Remove
            </button>
          </div>
          <Textarea value={a.why ?? ""} onChange={(v) => update(i, { why: v })} rows={2} />
          <input
            type="text"
            value={(a.bestFor ?? []).join(", ")}
            onChange={(e) =>
              update(i, {
                bestFor: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="Best voor (komma-gescheiden): homepage, meta, CTA"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        + Add angle
      </button>
    </div>
  );
}

function MissingContext({
  items,
  onChange,
}: {
  items: MissingContextItem[];
  onChange: (a: MissingContextItem[]) => void;
}) {
  function update(i: number, patch: Partial<MissingContextItem>) {
    onChange(items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { missing: "", impact: "", recommendedQuestion: "", priority: "medium" }]);
  }
  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen open vragen. AI (BP-2) zal hier gaps detecteren.</p>
      )}
      {items.map((x, i) => (
        <div key={i} className="rounded-md border border-border bg-background p-3 space-y-2">
          <div className="grid grid-cols-[1fr_140px_auto] items-start gap-2">
            <Input value={x.missing} onChange={(v) => update(i, { missing: v })} placeholder="Wat ontbreekt?" />
            <Select
              value={x.priority ?? "medium"}
              onChange={(v) => update(i, { priority: v as MissingContextItem["priority"] })}
              options={[
                ["low", "Low"],
                ["medium", "Medium"],
                ["high", "High"],
              ]}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            >
              Remove
            </button>
          </div>
          <Input value={x.impact ?? ""} onChange={(v) => update(i, { impact: v })} placeholder="Impact" />
          <Input
            value={x.recommendedQuestion ?? ""}
            onChange={(v) => update(i, { recommendedQuestion: v })}
            placeholder="Vraag aan operator/klant"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        + Add missing context
      </button>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ");
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function SuggestionsPanel({
  suggestions,
  onAccept,
  onReject,
  onEditAccept,
  pending,
}: {
  suggestions: Suggestion[];
  onAccept: (id: string, lockAfter?: boolean) => void;
  onReject: (id: string) => void;
  onEditAccept: (id: string, value: unknown) => void;
  pending: boolean;
}) {
  if (suggestions.length === 0) return null;
  const bySection = suggestions.reduce<Record<string, Suggestion[]>>((acc, s) => {
    (acc[s.section] ??= []).push(s);
    return acc;
  }, {});
  return (
    <section className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-foreground">
          AI suggesties ({suggestions.length})
        </h2>
        <span className="text-xs text-muted-foreground">
          Niets wordt automatisch overschreven. Accept / edit / reject per veld.
        </span>
      </div>
      <div className="mt-4 space-y-5">
        {Object.entries(bySection).map(([section, items]) => (
          <div key={section}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
              {section.replace(/_/g, " ")}
            </div>
            <div className="space-y-2">
              {items.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  pending={pending}
                  onAccept={onAccept}
                  onReject={onReject}
                  onEditAccept={onEditAccept}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SuggestionCard({
  s,
  pending,
  onAccept,
  onReject,
  onEditAccept,
}: {
  s: Suggestion;
  pending: boolean;
  onAccept: (id: string, lockAfter?: boolean) => void;
  onReject: (id: string) => void;
  onEditAccept: (id: string, value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const initial = Array.isArray(s.suggested_value)
    ? (s.suggested_value as unknown[]).join("\n")
    : typeof s.suggested_value === "object" && s.suggested_value !== null
    ? JSON.stringify(s.suggested_value, null, 2)
    : String(s.suggested_value ?? "");
  const [draft, setDraft] = useState(initial);

  function commitEdit() {
    const value = Array.isArray(s.suggested_value)
      ? draft.split("\n").map((l) => l.trim()).filter(Boolean)
      : draft;
    onEditAccept(s.id, value);
    setEditing(false);
  }

  const confPct = Math.round((s.confidence ?? 0) * 100);
  const confTone =
    confPct >= 70
      ? "text-emerald-700 dark:text-emerald-300"
      : confPct >= 40
      ? "text-amber-700 dark:text-amber-300"
      : "text-muted-foreground";

  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-xs text-muted-foreground">{s.field_path}</div>
        <span className={`text-xs font-semibold ${confTone}`}>{confPct}% confidence</span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Huidig</div>
          <div className="whitespace-pre-wrap text-foreground/80">{formatValue(s.current_value)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Voorgesteld</div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          ) : (
            <div className="whitespace-pre-wrap text-foreground">{formatValue(s.suggested_value)}</div>
          )}
        </div>
      </div>
      {s.rationale && (
        <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium">Waarom:</span> {s.rationale}</p>
      )}
      {s.source_evidence && s.source_evidence.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Evidence ({s.source_evidence.length})
          </summary>
          <ul className="mt-1 space-y-1 pl-4 text-muted-foreground">
            {s.source_evidence.map((ev, i) => (
              <li key={i}>
                {ev.url && <span className="font-mono">{ev.url}</span>}
                {ev.quote && <div className="italic">“{ev.quote}”</div>}
                {ev.reason && <div>{ev.reason}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button
              disabled={pending}
              onClick={commitEdit}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              Save & accept
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              disabled={pending}
              onClick={() => onAccept(s.id, false)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              Accept
            </button>
            <button
              disabled={pending}
              onClick={() => onAccept(s.id, true)}
              className="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              Accept + lock
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-border px-3 py-1 text-xs hover:bg-secondary"
            >
              Edit
            </button>
            <button
              disabled={pending}
              onClick={() => onReject(s.id)}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-60"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
