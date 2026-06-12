import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { X, Phone, Mail, Trophy } from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import {
  getMyClientDashboard,
  markLeadWonAsClient,
  dismissLeadAsClient,
} from "@/lib/shared/clientPortal/clientAuth.functions";
import { ClientShell } from "@/components/app/ClientShell";
import { StatusChip, useCountUp } from "@/components/client/bits";
import {
  portalCopy,
  formatMoney,
  formatRelative,
  type PortalLocale,
} from "@/lib/shared/clientPortal/portalCopy";
import type { ClientPortalData } from "@/lib/shared/clientPortal/clientAuth.functions";

export const Route = createFileRoute("/client/leads")({
  component: ClientLeads,
  head: () => ({ meta: [{ title: "Leads — LeadLayer" }] }),
});

type Lead = ClientPortalData["leads"][number];
type Filter = "all" | "new" | "qualified" | "won";

function ClientLeads() {
  const fetchDashboard = useServerFn(getMyClientDashboard);
  const [filter, setFilter] = useState<Filter>("all");
  const [wonModal, setWonModal] = useState<Lead | null>(null);

  const query = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: () => fetchDashboard(),
    retry: false,
  });

  const portal = query.data?.data ?? null;
  const locale: PortalLocale = portal?.locale ?? "en";
  const c = portalCopy(locale);

  // Show all leads except junk; client doesn't need to see trash
  const leads = (portal?.leads ?? []).filter((l) => l.status !== "junk");
  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  const counts: Record<Filter, number> = {
    all: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    qualified: leads.filter((l) => l.status === "qualified").length,
    won: leads.filter((l) => l.status === "won").length,
  };
  const wonValue = leads.reduce((sum, l) => sum + (l.closedAmount ?? 0), 0);

  const filterLabels: Record<Filter, string> = {
    all: c.filterAll,
    new: c.filterNew,
    qualified: c.filterQualified,
    won: c.filterWon,
  };

  return (
    <ClientShell
      businessName={portal?.businessName}
      locale={locale}
      hero={<LeadsHero count={leads.length} wonValue={wonValue} locale={locale} />}
    >
      {/* Filter tabs */}
      <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
        {(["all", "new", "qualified", "won"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-[4px] px-3.5 py-2 text-sm font-semibold transition-colors ${
              filter === f
                ? "bg-charcoal text-ondark"
                : "bg-paper-subtle text-ink-2 hover:bg-paper-inset"
            }`}
          >
            {filterLabels[f]}
            {counts[f] > 0 && (
              <span
                className={`ml-1.5 font-mono text-xs ${filter === f ? "text-ondark-2" : "text-ink-3"}`}
              >
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lead list */}
      {query.isLoading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[4px] bg-paper-subtle" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-paper-line-strong py-14 text-center">
          <p className="text-base text-ink-2">{c.noLeads}</p>
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              locale={locale}
              onMarkWon={() => setWonModal(lead)}
            />
          ))}
        </div>
      )}

      {wonModal && (
        <MarkWonModal lead={wonModal} locale={locale} onClose={() => setWonModal(null)} />
      )}
    </ClientShell>
  );
}

function LeadsHero({
  count,
  wonValue,
  locale,
}: {
  count: number;
  wonValue: number;
  locale: PortalLocale;
}) {
  const c = portalCopy(locale);
  const animated = useCountUp(count);
  return (
    <div>
      <p className="label-mono">{c.leadsTitle}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="font-display text-6xl font-extrabold leading-none tracking-[-0.03em] text-ink">
          {animated}
        </span>
        {wonValue > 0 && (
          <span className="font-display text-xl font-semibold" style={{ color: "#7BC796" }}>
            {c.wonValue(formatMoney(wonValue, locale))}
          </span>
        )}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  locale,
  onMarkWon,
}: {
  lead: Lead;
  locale: PortalLocale;
  onMarkWon: () => void;
}) {
  const c = portalCopy(locale);
  const qc = useQueryClient();
  const dismissFn = useServerFn(dismissLeadAsClient);

  const dismissMutation = useMutation({
    mutationFn: () => dismissFn({ data: { leadId: lead.id } }),
    onSuccess: () => {
      toast.success(c.leadDismissed);
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const open = lead.status === "new" || lead.status === "qualified";

  return (
    <div
      className="paper-card flex flex-col p-4"
      style={lead.status === "won" ? { borderLeft: "3px solid var(--paper-success)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[17px] font-semibold text-ink">
              {lead.name ?? c.unknownCaller}
            </p>
            <StatusChip status={lead.status} locale={locale} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
            {lead.phone && <span className="font-medium text-ink">{lead.phone}</span>}
            {lead.email && <span className="truncate">{lead.email}</span>}
            {lead.source && (
              <span className="text-ink-3">
                {c.via} {c.sources[lead.source] ?? lead.source}
              </span>
            )}
          </div>
          {lead.wonNotes && <p className="mt-1.5 text-sm text-ink-2">{lead.wonNotes}</p>}
        </div>
        <div className="shrink-0 text-right">
          {lead.closedAmount ? (
            <p className="font-display text-base font-bold text-paper-success">
              {formatMoney(lead.closedAmount, locale)}
            </p>
          ) : null}
          <p className="mt-1 text-[13px] text-ink-3">{formatRelative(lead.createdAt, locale)}</p>
        </div>
      </div>

      {open && (
        <div className="mt-4 flex flex-1 flex-col justify-end">
          <div className="flex flex-wrap items-center gap-2 border-t border-paper-line pt-3.5">
            {/* Primary: get in touch */}
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] bg-charcoal px-4 text-sm font-semibold text-ondark transition hover:bg-charcoal-soft"
              >
                <Phone className="h-3.5 w-3.5" /> {c.callBack}
              </a>
            ) : lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] bg-charcoal px-4 text-sm font-semibold text-ondark transition hover:bg-charcoal-soft"
              >
                <Mail className="h-3.5 w-3.5" /> {c.emailBack}
              </a>
            ) : null}

            {/* Outcome: won */}
            <button
              type="button"
              onClick={onMarkWon}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] border px-4 text-sm font-semibold transition hover:text-white"
              style={{ borderColor: "var(--paper-success)", color: "var(--paper-success)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--paper-success)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Trophy className="h-3.5 w-3.5" /> {c.wonButton}
            </button>
          </div>
          <button
            type="button"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            className="mt-2 w-full py-1.5 text-center text-[13px] text-ink-3 transition hover:text-paper-danger"
          >
            {dismissMutation.isPending ? c.dismissing : c.lostButton}
          </button>
        </div>
      )}
    </div>
  );
}

function MarkWonModal({
  lead,
  locale,
  onClose,
}: {
  lead: Lead;
  locale: PortalLocale;
  onClose: () => void;
}) {
  const c = portalCopy(locale);
  const qc = useQueryClient();
  const markWonFn = useServerFn(markLeadWonAsClient);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      markWonFn({
        data: {
          leadId: lead.id,
          closedAmount: parseFloat(amount) || 0,
          wonNotes: notes || undefined,
        },
      }),
    onSuccess: () => {
      confetti({
        particleCount: 60,
        spread: 55,
        origin: { y: 0.65 },
        colors: ["#1F7A36", "#D97706", "#F59E0B", "#4ADE80"],
        gravity: 1.2,
        scalar: 0.9,
      });
      toast.success(c.wonToast);
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="paper relative w-full max-w-sm rounded-t-[8px] border border-paper-line-strong bg-paper-raised p-5 sm:rounded-[4px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{c.wonModalTitle}</h2>
          <button type="button" onClick={onClose} className="p-1">
            <X className="h-4 w-4 text-ink-3" />
          </button>
        </div>

        <p className="mb-4 text-[15px] text-ink-2">
          {c.wonModalBody(lead.name ?? c.unknownCaller)}
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              {c.wonAmountLabel} <span className="text-paper-danger">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="h-12 w-full rounded-[4px] border border-paper-line-strong bg-white px-3 text-base text-ink outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/25"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">{c.wonNotesLabel}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={c.wonNotesPlaceholder}
              rows={2}
              className="w-full rounded-[4px] border border-paper-line-strong bg-white px-3 py-2.5 text-base text-ink outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/25"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!amount || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="cta-shear cta-shear-success mt-5 w-full"
        >
          {mutation.isPending ? c.wonSaving : c.wonConfirm}
        </button>
      </div>
    </div>
  );
}
