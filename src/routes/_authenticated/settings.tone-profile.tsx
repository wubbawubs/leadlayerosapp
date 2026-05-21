import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getToneProfile,
  analyzeToneProfile,
  saveToneProfile,
  setToneStatus,
  testToneOutput,
  listToneFeedback,
  addManualSample,
  listToneSamples,
  deleteToneSample,
} from "@/lib/shared/tone/repo.functions";
import { ToneProfileSchema, type ToneProfile } from "@/lib/shared/tone/schemas";


export const Route = createFileRoute("/_authenticated/settings/tone-profile")({
  component: ToneProfilePage,
});

function ToneProfilePage() {
  const qc = useQueryClient();
  const fetchTenants = useServerFn(listMyTenants);
  const fetchProfile = useServerFn(getToneProfile);
  const analyze = useServerFn(analyzeToneProfile);
  const save = useServerFn(saveToneProfile);
  const setStatus = useServerFn(setToneStatus);
  const testOut = useServerFn(testToneOutput);
  const fetchFeedback = useServerFn(listToneFeedback);
  const fetchSamples = useServerFn(listToneSamples);
  const addSample = useServerFn(addManualSample);
  const deleteSample = useServerFn(deleteToneSample);


  const tenantsQuery = useQuery({ queryKey: ["my-tenants"], queryFn: () => fetchTenants() });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ["tone-profile", tenantId],
    queryFn: () => (tenantId ? fetchProfile({ data: { tenantId } }) : Promise.resolve({ profile: null })),
    enabled: !!tenantId,
    refetchInterval: (q) => {
      const status = (q.state.data as { profile?: { job_status?: string } } | undefined)?.profile?.job_status;
      return status === "running" || status === "queued" ? 3000 : false;
    },
  });

  const feedbackQuery = useQuery({
    queryKey: ["tone-feedback", tenantId],
    queryFn: () => (tenantId ? fetchFeedback({ data: { tenantId } }) : Promise.resolve({ feedback: [] })),
    enabled: !!tenantId,
  });

  const samplesQuery = useQuery({
    queryKey: ["tone-samples", tenantId],
    queryFn: () => (tenantId ? fetchSamples({ data: { tenantId } }) : Promise.resolve({ samples: [] })),
    enabled: !!tenantId,
  });

  const [pasteText, setPasteText] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteLabel, setPasteLabel] = useState("");
  const addSampleMut = useMutation({
    mutationFn: () =>
      addSample({
        data: {
          tenantId: tenantId!,
          text: pasteText,
          sourceUrl: pasteUrl || undefined,
          label: pasteLabel || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Sample toegevoegd. Klik 'Re-analyze' om mee te nemen.");
      setPasteText(""); setPasteUrl(""); setPasteLabel("");
      qc.invalidateQueries({ queryKey: ["tone-samples", tenantId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteSampleMut = useMutation({
    mutationFn: (sampleId: string) => deleteSample({ data: { tenantId: tenantId!, sampleId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tone-samples", tenantId] }),
  });


  const [draft, setDraft] = useState<ToneProfile | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const raw = profileQuery.data?.profile;
    if (raw?.profile && !dirty) {
      try {
        setDraft(ToneProfileSchema.parse(JSON.parse(raw.profile)));
      } catch {
        setDraft(null);
      }
    }
  }, [profileQuery.data, dirty]);

  const analyzeMut = useMutation({
    mutationFn: () => analyze({ data: { tenantId: tenantId! } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Analyse gestart"); else toast.error(r.error);
      qc.invalidateQueries({ queryKey: ["tone-profile", tenantId] });
    },
  });

  const saveMut = useMutation({
    mutationFn: (status?: "draft" | "approved" | "locked") =>
      save({ data: { tenantId: tenantId!, profile: draft!, status } }),
    onSuccess: () => {
      toast.success("Opgeslagen");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["tone-profile", tenantId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const statusMut = useMutation({
    mutationFn: (status: "draft" | "approved" | "locked") =>
      setStatus({ data: { tenantId: tenantId!, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tone-profile", tenantId] }),
  });

  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof testOut>> | null>(null);
  const testMut = useMutation({
    mutationFn: (kind: "meta" | "h1" | "cta") => testOut({ data: { tenantId: tenantId!, kind } }),
    onSuccess: (r) => setTestResult(r),
  });

  if (!tenantId) return <div className="p-8">Geen tenant. Maak eerst een tenant via onboarding.</div>;

  const profileRow = profileQuery.data?.profile;
  const jobStatus = profileRow?.job_status;
  const confidence = profileRow?.confidence_score;
  const status = profileRow?.status ?? "draft";

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
            <Link to="/sites" className="text-muted-foreground hover:text-foreground">Sites</Link>
            <Link to="/settings/business-profile" className="text-muted-foreground hover:text-foreground">Business profile</Link>
            <span className="text-foreground font-medium">Tone profile</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 pb-24">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Linguistic Brand Model</p>
            <h1 className="font-display text-4xl text-foreground">Tone profile</h1>
            <p className="mt-2 text-muted-foreground">
              Hoe dit merk schrijft, welke woorden wel/niet mogen, en hoe proposals beoordeeld worden.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill status={status} />
            {confidence != null && (
              <span className="text-xs text-muted-foreground">Confidence: {Number(confidence).toFixed(1)}/10</span>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => analyzeMut.mutate()}
            disabled={analyzeMut.isPending || jobStatus === "running"}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {jobStatus === "running" || analyzeMut.isPending ? "Bezig met analyseren…" : profileRow ? "Re-analyze from website" : "Analyze from website"}
          </button>
          {draft && (
            <>
              <button
                onClick={() => saveMut.mutate(undefined)}
                disabled={!dirty || saveMut.isPending}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                {dirty ? "Save changes" : "Saved"}
              </button>
              {status !== "approved" && (
                <button
                  onClick={() => statusMut.mutate("approved")}
                  className="rounded-md border border-primary bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
                >
                  Approve
                </button>
              )}
              {status === "approved" && (
                <button onClick={() => statusMut.mutate("draft")} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">
                  Set to draft
                </button>
              )}
            </>
          )}
        </div>

        {profileRow?.job_error && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {profileRow.job_error}
          </div>
        )}

        <ConfidenceBreakdown summaryJson={profileRow?.source_summary} />

        <ManualSamplesPanel
          samples={samplesQuery.data?.samples ?? []}
          pasteText={pasteText}
          pasteUrl={pasteUrl}
          pasteLabel={pasteLabel}
          onPasteText={setPasteText}
          onPasteUrl={setPasteUrl}
          onPasteLabel={setPasteLabel}
          onAdd={() => addSampleMut.mutate()}
          onDelete={(id) => deleteSampleMut.mutate(id)}
          isPending={addSampleMut.isPending}
        />



        {!profileRow && !analyzeMut.isPending && (
          <div className="rounded border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            Nog geen tone profile. Zorg dat er minstens één succesvolle audit is en klik op "Analyze from website".
          </div>
        )}

        {draft && (
          <div className="space-y-6">
            <Section title="Voice identity">
              <Field label="Samenvatting">
                <textarea
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                  rows={4}
                  value={draft.voiceIdentity.summary}
                  onChange={(e) => { setDraft({ ...draft, voiceIdentity: { ...draft.voiceIdentity, summary: e.target.value } }); setDirty(true); }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Persona">
                  <Input value={draft.voiceIdentity.persona} onChange={(v) => { setDraft({ ...draft, voiceIdentity: { ...draft.voiceIdentity, persona: v } }); setDirty(true); }} />
                </Field>
                <Field label="Commercial intensity">
                  <select
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                    value={draft.voiceIdentity.commercialIntensity}
                    onChange={(e) => { setDraft({ ...draft, voiceIdentity: { ...draft.voiceIdentity, commercialIntensity: e.target.value as never } }); setDirty(true); }}
                  >
                    <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="Woorden">
              <TagList label="Preferred" value={draft.vocabulary.preferred} onChange={(v) => { setDraft({ ...draft, vocabulary: { ...draft.vocabulary, preferred: v } }); setDirty(true); }} />
              <TagList label="Avoid" value={draft.vocabulary.avoid} onChange={(v) => { setDraft({ ...draft, vocabulary: { ...draft.vocabulary, avoid: v } }); setDirty(true); }} />
              <TagList label="Forbidden (blokkeert proposals)" value={draft.vocabulary.forbidden} onChange={(v) => { setDraft({ ...draft, vocabulary: { ...draft.vocabulary, forbidden: v } }); setDirty(true); }} />
            </Section>

            <Section title="Claims">
              <TagList label="Allowed claims" value={draft.claimStyle.allowedClaims} onChange={(v) => { setDraft({ ...draft, claimStyle: { ...draft.claimStyle, allowedClaims: v } }); setDirty(true); }} />
              <TagList label="Risky claims" value={draft.claimStyle.riskyClaims} onChange={(v) => { setDraft({ ...draft, claimStyle: { ...draft.claimStyle, riskyClaims: v } }); setDirty(true); }} />
              <TagList label="Forbidden claims" value={draft.claimStyle.forbiddenClaims} onChange={(v) => { setDraft({ ...draft, claimStyle: { ...draft.claimStyle, forbiddenClaims: v } }); setDirty(true); }} />
            </Section>

            <Section title="CTA's">
              <Field label="CTA stijl">
                <Input value={draft.ctaStyle.style} onChange={(v) => { setDraft({ ...draft, ctaStyle: { ...draft.ctaStyle, style: v } }); setDirty(true); }} />
              </Field>
              <TagList label="Primary CTA patterns" value={draft.ctaStyle.primaryCtaPatterns} onChange={(v) => { setDraft({ ...draft, ctaStyle: { ...draft.ctaStyle, primaryCtaPatterns: v } }); setDirty(true); }} />
            </Section>

            <Section title="Voorbeelden">
              <TagList label="Goede zinnen" value={draft.examples.good} onChange={(v) => { setDraft({ ...draft, examples: { ...draft.examples, good: v } }); setDirty(true); }} />
              <TagList label="Slechte zinnen" value={draft.examples.bad} onChange={(v) => { setDraft({ ...draft, examples: { ...draft.examples, bad: v } }); setDirty(true); }} />
            </Section>

            <Section title="Test output">
              <div className="flex gap-2">
                {(["meta", "h1", "cta"] as const).map((k) => (
                  <button key={k} disabled={testMut.isPending} onClick={() => testMut.mutate(k)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">
                    Genereer {k}
                  </button>
                ))}
              </div>
              {testResult?.ok && (
                <div className="mt-4 rounded border border-border bg-background/40 p-4">
                  <div className="mb-2 text-sm text-foreground">{testResult.text}</div>
                  <div className="text-xs text-muted-foreground">
                    Verdict: <span className="font-semibold">{testResult.verdict}</span> · Weighted: {testResult.weighted.toFixed(1)}/10
                  </div>
                  <pre className="mt-2 text-xs text-muted-foreground">{JSON.stringify(testResult.score, null, 2)}</pre>
                  {testResult.riskFlags.length > 0 && (
                    <div className="mt-2 text-xs text-destructive">Flags: {testResult.riskFlags.join(", ")}</div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Feedback log">
              {(feedbackQuery.data?.feedback ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nog geen feedback. Approve/reject proposals om dit te vullen.</p>
              )}
              <ul className="space-y-2">
                {(feedbackQuery.data?.feedback ?? []).map((f) => (
                  <li key={f.id} className="rounded border border-border bg-background/30 px-3 py-2 text-xs">
                    <span className={f.example_type === "approved" ? "text-primary" : "text-destructive"}>{f.example_type}</span>
                    {" · "}{f.after_text}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "approved" ? "bg-primary/20 text-primary" :
    status === "locked" ? "bg-blue-500/20 text-blue-400" :
    "bg-muted text-muted-foreground";
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card/70 p-5">
      <h2 className="mb-4 font-display text-lg text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function TagList({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  return (
    <Field label={label}>
      <div className="mb-2 flex flex-wrap gap-1">
        {value.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs">
            {v}
            <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              onChange([...value, input.trim()]);
              setInput("");
            }
          }}
          placeholder="Type en druk Enter…"
        />
      </div>
    </Field>
  );
}
