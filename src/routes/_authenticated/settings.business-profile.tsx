import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Logo } from "@/components/brand/Logo";
import { TenantSwitcher } from "@/components/app/TenantSwitcher";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getBusinessProfile,
  upsertBusinessProfile,
  getBrandVoiceProfile,
} from "@/lib/shared/db/repos/context.functions";
import { analyzeBrandVoice } from "@/lib/shared/context/analyzer.functions";

export const Route = createFileRoute("/_authenticated/settings/business-profile")({
  component: BusinessProfilePage,
});

type FormState = {
  businessName: string;
  industry: string;
  primaryOffer: string;
  secondaryOffers: string;
  targetAudience: string;
  serviceAreas: string;
  uniqueValueProposition: string;
  mainPromise: string;
  proofPoints: string;
  avoidClaims: string;
  preferredCta: string;
  tonePreference: string;
  language: string;
};

const EMPTY: FormState = {
  businessName: "",
  industry: "",
  primaryOffer: "",
  secondaryOffers: "",
  targetAudience: "",
  serviceAreas: "",
  uniqueValueProposition: "",
  mainPromise: "",
  proofPoints: "",
  avoidClaims: "",
  preferredCta: "",
  tonePreference: "",
  language: "nl",
};

function splitLines(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function joinLines(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.filter((x) => typeof x === "string").join("\n");
}

function BusinessProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchProfile = useServerFn(getBusinessProfile);
  const save = useServerFn(upsertBusinessProfile);
  const fetchVoice = useServerFn(getBrandVoiceProfile);
  const analyze = useServerFn(analyzeBrandVoice);

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
    queryKey: ["business-profile", tenantId],
    queryFn: () => fetchProfile({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const voiceQuery = useQuery({
    queryKey: ["brand-voice", tenantId],
    queryFn: () => fetchVoice({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
    refetchInterval: (q) => {
      const s = (q.state.data as { profile?: { job_status?: string } } | undefined)
        ?.profile?.job_status;
      return s === "running" || s === "queued" ? 2500 : false;
    },
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);

  // Hydrate form from loaded profile
  useEffect(() => {
    const p = profileQuery.data?.profile as Record<string, unknown> | null | undefined;
    if (!p) {
      setForm(EMPTY);
      return;
    }
    setForm({
      businessName: (p.business_name as string) ?? "",
      industry: (p.industry as string) ?? "",
      primaryOffer: (p.primary_offer as string) ?? "",
      secondaryOffers: joinLines(p.secondary_offers),
      targetAudience: joinLines(p.target_audience),
      serviceAreas: joinLines(p.service_areas),
      uniqueValueProposition: (p.unique_value_proposition as string) ?? "",
      mainPromise: (p.main_promise as string) ?? "",
      proofPoints: joinLines(p.proof_points),
      avoidClaims: joinLines(p.avoid_claims),
      preferredCta: (p.preferred_cta as string) ?? "",
      tonePreference: (p.tone_preference as string) ?? "",
      language: (p.language as string) ?? "nl",
    });
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Geen tenant geselecteerd");
      return save({
        data: {
          tenantId,
          businessName: form.businessName || null,
          industry: form.industry || null,
          primaryOffer: form.primaryOffer || null,
          secondaryOffers: splitLines(form.secondaryOffers),
          targetAudience: splitLines(form.targetAudience),
          serviceAreas: splitLines(form.serviceAreas),
          uniqueValueProposition: form.uniqueValueProposition || null,
          mainPromise: form.mainPromise || null,
          proofPoints: splitLines(form.proofPoints),
          avoidClaims: splitLines(form.avoidClaims),
          preferredCta: form.preferredCta || null,
          tonePreference: form.tonePreference || null,
          language: form.language || "nl",
        },
      });
    },
    onSuccess: () => {
      setMsg("Opgeslagen.");
      qc.invalidateQueries({ queryKey: ["business-profile", tenantId] });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e) => setMsg(`Fout: ${(e as Error).message}`),
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Geen tenant geselecteerd");
      return analyze({ data: { tenantId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-voice", tenantId] });
    },
  });

  const voice = voiceQuery.data?.profile as
    | {
        job_status?: string;
        job_error?: string | null;
        tone_summary?: string | null;
        preferred_words?: unknown;
        forbidden_words?: unknown;
        analyzed_at?: string | null;
      }
    | null
    | undefined;

  const empty = useMemo(
    () => !profileQuery.isLoading && !profileQuery.data?.profile,
    [profileQuery.isLoading, profileQuery.data],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

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

      <main className="container mx-auto max-w-3xl px-6 pb-24 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          S4.5 · Context Layer
        </p>
        <h1 className="font-display text-4xl text-foreground">Business profile</h1>
        <p className="mt-2 text-muted-foreground">
          Deze context wordt door de proposal engine gebruikt zodat voorstellen
          passen bij jouw merk, aanbod en doelgroep — in plaats van generieke SEO-tekst.
        </p>

        {empty && (
          <div className="mt-6 rounded-md border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
            Nog geen profiel. Vul hieronder de velden in en klik op{" "}
            <strong className="text-foreground">Opslaan</strong>.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <Row label="Bedrijfsnaam">
            <Input
              value={form.businessName}
              onChange={(v) => setForm({ ...form, businessName: v })}
              placeholder="KlikKlaar"
            />
          </Row>

          <Row label="Branche / industrie">
            <Input
              value={form.industry}
              onChange={(v) => setForm({ ...form, industry: v })}
              placeholder="Marketing-software voor lokale ondernemers"
            />
          </Row>

          <Row label="Primair aanbod (1 zin)">
            <Input
              value={form.primaryOffer}
              onChange={(v) => setForm({ ...form, primaryOffer: v })}
              placeholder="Automatische lokale vindbaarheid voor lokale dienstverleners"
            />
          </Row>

          <Row
            label="Secundair aanbod"
            hint="Eén item per regel"
          >
            <Textarea
              value={form.secondaryOffers}
              onChange={(v) => setForm({ ...form, secondaryOffers: v })}
              placeholder={"Google Business Profile beheer\nReview-collectie\nLokale landingspagina's"}
              rows={3}
            />
          </Row>

          <Row label="Doelgroep" hint="Eén item per regel">
            <Textarea
              value={form.targetAudience}
              onChange={(v) => setForm({ ...form, targetAudience: v })}
              placeholder={"Kappers\nTandartsen\nMakelaars\nLokale dienstverleners"}
              rows={3}
            />
          </Row>

          <Row label="Werkgebieden / regio's" hint="Eén item per regel">
            <Textarea
              value={form.serviceAreas}
              onChange={(v) => setForm({ ...form, serviceAreas: v })}
              placeholder={"Nederland\nVlaanderen"}
              rows={2}
            />
          </Row>

          <Row label="Unique value proposition">
            <Textarea
              value={form.uniqueValueProposition}
              onChange={(v) => setForm({ ...form, uniqueValueProposition: v })}
              placeholder="Lokaal beter vindbaar zonder dat je zelf SEO hoeft te begrijpen."
              rows={2}
            />
          </Row>

          <Row label="Belofte (wat mag je veilig zeggen)">
            <Textarea
              value={form.mainPromise}
              onChange={(v) => setForm({ ...form, mainPromise: v })}
              placeholder="Meer lokale aanvragen, zonder technisch gedoe."
              rows={2}
            />
          </Row>

          <Row label="Bewijspunten" hint="Eén per regel — cijfers, cases, certificeringen">
            <Textarea
              value={form.proofPoints}
              onChange={(v) => setForm({ ...form, proofPoints: v })}
              placeholder={"500+ ondernemers gebruiken KlikKlaar\nGemiddeld 32% meer aanvragen in 90 dagen"}
              rows={3}
            />
          </Row>

          <Row label="Te vermijden claims" hint="Eén per regel">
            <Textarea
              value={form.avoidClaims}
              onChange={(v) => setForm({ ...form, avoidClaims: v })}
              placeholder={"Sta gegarandeerd bovenaan in Google\nNummer 1 in Nederland"}
              rows={3}
            />
          </Row>

          <Row label="Voorkeurs-CTA">
            <Input
              value={form.preferredCta}
              onChange={(v) => setForm({ ...form, preferredCta: v })}
              placeholder="Vraag gratis kennismaking aan"
            />
          </Row>

          <Row label="Toonvoorkeur">
            <Textarea
              value={form.tonePreference}
              onChange={(v) => setForm({ ...form, tonePreference: v })}
              placeholder="Direct, simpel, niet-corporate. Geen 'ontdek hoe' AI-clichés."
              rows={2}
            />
          </Row>

          <Row label="Taal">
            <Input
              value={form.language}
              onChange={(v) => setForm({ ...form, language: v })}
              placeholder="nl"
            />
          </Row>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saveMutation.isPending || !tenantId}
              className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Opslaan…" : "Opslaan"}
            </button>
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </form>

        <section className="mt-12 rounded-lg border border-border bg-card/70 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Brand voice</h2>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Geanalyseerd uit recent geauditeerde pagina's
              </p>
            </div>
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={
                analyzeMutation.isPending ||
                voice?.job_status === "running" ||
                voice?.job_status === "queued"
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
            >
              {voice?.job_status === "running"
                ? "Analyseren…"
                : "Analyseer brand voice"}
            </button>
          </div>

          {!voice && (
            <p className="text-sm text-muted-foreground">
              Nog geen analyse uitgevoerd.
            </p>
          )}
          {voice?.job_status === "failed" && (
            <p className="text-sm text-destructive">
              Mislukt: {voice.job_error ?? "onbekende fout"}
            </p>
          )}
          {voice?.tone_summary && (
            <div className="space-y-2 text-sm">
              <p className="text-foreground">{voice.tone_summary}</p>
              {Array.isArray(voice.preferred_words) && voice.preferred_words.length > 0 && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Voorkeurswoorden:</span>{" "}
                  {(voice.preferred_words as string[]).join(", ")}
                </p>
              )}
              {Array.isArray(voice.forbidden_words) && voice.forbidden_words.length > 0 && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Vermijden:</span>{" "}
                  {(voice.forbidden_words as string[]).join(", ")}
                </p>
              )}
              {voice.analyzed_at && (
                <p className="text-xs text-muted-foreground">
                  Laatst geanalyseerd: {new Date(voice.analyzed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
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

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
}
