import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { listMyTenants } from "@/lib/shared/db/repos/tenants.functions";
import {
  getLeadStats,
  listLeads,
  logLeadManually,
  markLeadWon,
  type LeadStatus,
} from "@/lib/shared/leads/repo.functions";
import {
  createLeadIngestionSource,
  listLeadIngestionSources,
  revokeLeadIngestionSource,
} from "@/lib/shared/leadIngestion/leadIngestion.functions";
import type { LeadIngestionSource } from "@/lib/shared/leadIngestion/schemas";

export const Route = createFileRoute("/_authenticated/growth/leads")({
  component: LeadsPage,
  head: () => ({
    meta: [{ title: "Lead Inbox — LeadLayer" }],
  }),
});

const SOURCES = [
  { value: "call", label: "Phone call" },
  { value: "form", label: "Website form" },
  { value: "organic", label: "Organic search" },
  { value: "referral", label: "Referral" },
  { value: "google_business_profile", label: "Google Business Profile" },
  { value: "manual", label: "Manual entry" },
  { value: "other", label: "Other" },
] as const;

// Only expose statuses that match the DB enum to avoid constraint errors.
const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400",
  qualified: "bg-primary/15 text-primary",
  won: "bg-emerald-500/15 text-emerald-400",
  lost: "bg-muted text-muted-foreground",
  unqualified: "bg-amber-500/15 text-amber-400",
  junk: "bg-muted text-muted-foreground",
};

function emptyForm() {
  return {
    name: "",
    phone: "",
    email: "",
    source: "call",
    status: "new" as LeadStatus,
    service: "",
    location: "",
    estimatedValue: "",
    notes: "",
  };
}

function LeadsPage() {
  const qc = useQueryClient();

  const fetchTenants = useServerFn(listMyTenants);
  const fetchStats = useServerFn(getLeadStats);
  const fetchLeads = useServerFn(listLeads);
  const doLog = useServerFn(logLeadManually);
  const doMarkWon = useServerFn(markLeadWon);
  const doCreateSource = useServerFn(createLeadIngestionSource);
  const doListSources = useServerFn(listLeadIngestionSources);
  const doRevokeSource = useServerFn(revokeLeadIngestionSource);

  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
  });
  const tenantId = tenantsQuery.data?.tenants[0]?.id ?? null;

  const statsQuery = useQuery({
    queryKey: ["lead-stats", tenantId],
    queryFn: () => fetchStats({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const leadsQuery = useQuery({
    queryKey: ["leads-list", tenantId],
    queryFn: () =>
      tenantId
        ? fetchLeads({ data: { tenantId, limit: 100 } })
        : Promise.resolve({ leads: [] }),
    enabled: !!tenantId,
  });

  const sourcesQuery = useQuery({
    queryKey: ["lead-ingestion-sources", tenantId],
    queryFn: () => doListSources({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const [form, setForm] = useState(emptyForm());
  const [formOpen, setFormOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [wonModal, setWonModal] = useState<{ leadId: string; name: string | null } | null>(null);
  const [wonAmount, setWonAmount] = useState("");
  const [wonNotes, setWonNotes] = useState("");

  const markWonMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !wonModal) throw new Error("No active tenant or lead");
      const amount = parseFloat(wonAmount);
      if (isNaN(amount) || amount < 0) throw new Error("Enter a valid closed amount (0 or more)");
      return doMarkWon({
        data: {
          tenantId,
          leadId: wonModal.leadId,
          closedAmount: amount,
          wonNotes: wonNotes || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Lead marked as won");
      setWonModal(null);
      setWonAmount("");
      setWonNotes("");
      void qc.invalidateQueries({ queryKey: ["lead-stats", tenantId] });
      void qc.invalidateQueries({ queryKey: ["leads-list", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mark lead as won"),
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active tenant");
      return doLog({
        data: {
          tenantId,
          name: form.name || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          source: form.source || "manual",
          status: form.status,
          notes: form.notes || undefined,
          attribution: {
            ...(form.service && { service: form.service }),
            ...(form.location && { location: form.location }),
            ...(form.estimatedValue && {
              estimatedValue: parseFloat(form.estimatedValue) || 0,
            }),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Lead logged");
      setForm(emptyForm());
      setFormOpen(false);
      void qc.invalidateQueries({ queryKey: ["lead-stats", tenantId] });
      void qc.invalidateQueries({ queryKey: ["leads-list", tenantId] });
      // Invalidate Snapshot so tracking slice refreshes
      void qc.invalidateQueries({ queryKey: ["growth-intelligence-snapshot", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to log lead"),
  });

  const createSourceMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active tenant");
      if (!newSourceName.trim()) throw new Error("Source name required");
      return doCreateSource({ data: { tenantId, name: newSourceName.trim() } });
    },
    onSuccess: () => {
      toast.success("Webhook source created");
      setNewSourceName("");
      void qc.invalidateQueries({ queryKey: ["lead-ingestion-sources", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create source"),
  });

  const revokeSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!tenantId) throw new Error("No active tenant");
      return doRevokeSource({ data: { tenantId, sourceId } });
    },
    onSuccess: () => {
      toast.success("Webhook source revoked");
      void qc.invalidateQueries({ queryKey: ["lead-ingestion-sources", tenantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke source"),
  });

  const stats = statsQuery.data?.stats;
  const leads = leadsQuery.data?.leads ?? [];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    logMutation.mutate();
  }

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/app" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/growth/masterplan" className="text-muted-foreground hover:text-foreground">
              Masterplan
            </Link>
            <span className="font-medium text-foreground">Leads</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-6 pb-24 pt-4">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Lead Inbox · V1
            </p>
            <h1 className="font-display text-4xl text-foreground">Lead Inbox</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Track real leads against the growth goal. V1 is manual logging — automatic
              form/call tracking comes later.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {formOpen ? "Cancel" : "+ Log lead"}
          </button>
        </div>

        {/* Log lead form */}
        {formOpen && (
          <div className="mb-6 rounded-lg border border-border bg-card/70 p-6">
            <h2 className="mb-4 font-display text-xl text-foreground">Log a lead</h2>
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Client name"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 000 0000"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Source">
                <select
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  className={INPUT_CLS}
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Service requested">
                <input
                  value={form.service}
                  onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                  placeholder="AC repair, HVAC install…"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Location">
                <input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Dallas, TX"
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as LeadStatus }))
                  }
                  className={INPUT_CLS}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Estimated value (€/$)">
                <input
                  type="number"
                  min={0}
                  value={form.estimatedValue}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))}
                  placeholder="850"
                  className={INPUT_CLS}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Context, source detail, follow-up needed…"
                    rows={2}
                    className={`${INPUT_CLS} resize-none`}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={logMutation.isPending}
                  className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {logMutation.isPending ? "Logging…" : "Log lead"}
                </button>
                {logMutation.isError && (
                  <p className="mt-2 text-xs text-destructive">
                    {(logMutation.error as Error).message}
                  </p>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Stats summary */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                { label: "Total leads", value: stats.total },
                { label: "Last 7 days", value: stats.last7Days },
                { label: "Last 30 days", value: stats.last30Days },
                { label: "Qualified", value: stats.byStatus.qualified ?? 0 },
                { label: "Won", value: stats.byStatus.won ?? 0 },
              ] as Array<{ label: string; value: number }>
            ).map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-card/60 p-4">
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Leads table */}
        {leads.length === 0 && !leadsQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
            <p className="text-muted-foreground">
              No leads logged yet. Log leads manually to start measuring progress against the
              growth goal.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Automatic form and call tracking will be added in a future sprint.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/30">
                <tr>
                  {["Date", "Name", "Source", "Service", "Status", "Closed", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => {
                  const attr = (lead.attribution ?? {}) as Record<string, unknown>;
                  const isWon = lead.status === "won";
                  return (
                    <tr key={lead.id} className="hover:bg-secondary/20">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {lead.name ?? (lead.phone ?? lead.email ?? "—")}
                      </td>
                      <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">
                        {lead.source?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-2.5 text-xs text-muted-foreground">
                        {typeof attr.service === "string" ? attr.service : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[lead.status] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-emerald-400">
                        {isWon && lead.closedAmount != null
                          ? `€${lead.closedAmount.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {!isWon && lead.status !== "lost" && (
                          <button
                            onClick={() => setWonModal({ leadId: lead.id, name: lead.name })}
                            className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20"
                          >
                            Mark won
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              {leads.length} lead{leads.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
        {/* Mark as won modal */}
        {wonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="font-display text-lg text-foreground">Mark lead as won</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {wonModal.name ? `Recording closed deal for ${wonModal.name}.` : "Recording closed deal."}
              </p>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground">
                    Closed amount (€ / $) <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={wonAmount}
                    onChange={(e) => setWonAmount(e.target.value)}
                    placeholder="e.g. 1200"
                    className={INPUT_CLS}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground">Notes (optional)</span>
                  <textarea
                    value={wonNotes}
                    onChange={(e) => setWonNotes(e.target.value)}
                    placeholder="Service scope, deal context…"
                    rows={2}
                    className={`${INPUT_CLS} resize-none`}
                  />
                </label>
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  disabled={markWonMutation.isPending || !wonAmount}
                  onClick={() => markWonMutation.mutate()}
                  className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {markWonMutation.isPending ? "Saving…" : "Mark as won"}
                </button>
                <button
                  onClick={() => { setWonModal(null); setWonAmount(""); setWonNotes(""); }}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              {markWonMutation.isError && (
                <p className="mt-2 text-xs text-destructive">
                  {(markWonMutation.error as Error).message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lead capture sources */}
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            <span>{showSources ? "▼" : "▶"}</span>
            Lead capture sources (webhook)
          </button>

          {showSources && (
            <div className="mt-4 space-y-5">
              <p className="text-sm text-muted-foreground">
                Create a webhook source to receive leads automatically from your website contact form.
                Use the endpoint URL as a webhook target in your form plugin (Gravity Forms, WPForms, Contact Form 7, etc.).
              </p>

              {/* Create new source */}
              <div className="flex items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground">Source name</span>
                  <input
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="e.g. Contact form — homepage"
                    className={INPUT_CLS}
                    style={{ width: 280 }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!tenantId || createSourceMutation.isPending}
                  onClick={() => createSourceMutation.mutate()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {createSourceMutation.isPending ? "Creating…" : "Create webhook"}
                </button>
              </div>

              {/* Sources list */}
              {(sourcesQuery.data?.sources ?? []).length === 0 && !sourcesQuery.isLoading && (
                <p className="text-xs text-muted-foreground">No webhook sources yet.</p>
              )}
              {(sourcesQuery.data?.sources ?? []).map((src: LeadIngestionSource) => (
                <WebhookSourceCard
                  key={src.id}
                  source={src}
                  onRevoke={() => revokeSourceMutation.mutate(src.id)}
                  revoking={revokeSourceMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function WebhookSourceCard({
  source,
  onRevoke,
  revoking,
}: {
  source: LeadIngestionSource;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const endpointBase =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "";
  const endpointUrl = `${endpointBase}/api/public/lead-ingest`;
  const snippet = `fetch("${endpointUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publicKey: "${source.publicKey}",
    name: "{{field:name}}",
    email: "{{field:email}}",
    phone: "{{field:phone}}",
    message: "{{field:message}}"
  })
});`;

  const isRevoked = source.status === "revoked";

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{source.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {new Date(source.createdAt).toLocaleDateString()}
            {" · "}Default source: <span className="text-foreground">{source.defaultSource}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isRevoked
                ? "bg-muted text-muted-foreground"
                : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {source.status}
          </span>
          {!isRevoked && (
            <button
              disabled={revoking}
              onClick={onRevoke}
              className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
            >
              Revoke
            </button>
          )}
        </div>
      </div>

      {!isRevoked && (
        <div className="mt-3 space-y-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Endpoint URL</p>
            <code className="block rounded bg-background/60 px-3 py-2 text-xs text-foreground break-all">
              POST {endpointUrl}
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Public key</p>
            <code className="block rounded bg-background/60 px-3 py-2 text-xs text-foreground break-all">
              {source.publicKey}
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Integration snippet (fetch / form webhook)
            </p>
            <pre className="overflow-x-auto rounded bg-background/60 px-3 py-2 text-xs text-foreground">
              {snippet}
            </pre>
            <p className="mt-1 text-xs text-muted-foreground">
              In WordPress: paste the endpoint URL into your form plugin's webhook settings
              and map your form fields to <code>name</code>, <code>email</code>, <code>phone</code>, <code>message</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
