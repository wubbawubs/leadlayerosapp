import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trophy } from "lucide-react";

import {
  listLeads,
  getLeadStats,
  markLeadWon,
  logLeadManually,
  updateLeadStatus,
  type LeadSummary,
  type LeadStatus,
} from "@/lib/shared/leads/repo.functions";
import { StatusPill, type StatusTone } from "@/components/execution/StatusPill";
import { SkeletonLeadRow } from "@/components/ui/Skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/leads")({
  component: LeadsTab,
  head: () => ({ meta: [{ title: "Leads — LeadLayer" }] }),
});

type Filter = "all" | LeadStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "junk", label: "Junk" },
];

function LeadsTab() {
  const { tenantId } = Route.useParams();
  const fetchLeads = useServerFn(listLeads);
  const fetchStats = useServerFn(getLeadStats);

  const leadsQuery = useQuery({
    queryKey: ["leads", tenantId],
    queryFn: () => fetchLeads({ data: { tenantId, limit: 200 } }),
  });
  const statsQuery = useQuery({
    queryKey: ["lead-stats", tenantId],
    queryFn: () => fetchStats({ data: { tenantId } }),
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [logOpen, setLogOpen] = useState(false);
  const [wonLead, setWonLead] = useState<LeadSummary | null>(null);
  const qc = useQueryClient();

  const all = leadsQuery.data?.leads ?? [];
  const stats = statsQuery.data?.stats;

  const provenRevenue = all
    .filter((l) => l.status === "won")
    .reduce((sum, l) => sum + (l.closedAmount ?? 0), 0);

  const counts: Record<Filter, number> = {
    all: all.length,
    new: stats?.byStatus.new ?? 0,
    qualified: stats?.byStatus.qualified ?? 0,
    won: stats?.byStatus.won ?? 0,
    lost: stats?.byStatus.lost ?? 0,
    junk: stats?.byStatus.junk ?? 0,
  };

  const filtered = all.filter((l) =>
    filter === "all" ? true : l.status === filter,
  );

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <div className="flex items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            § Leads · Inbox
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            Lead inbox
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Inbound leads from webhooks and manually logged calls. Mark won
            to prove revenue and feed monthly reports.
          </p>
        </div>
        <Button
          variant="default"
          className="gap-2 font-mono text-[11px] uppercase tracking-[0.14em]"
          onClick={() => setLogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Log lead
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
        <StatCard
          label="Last 30 days"
          value={stats ? String(stats.last30Days) : "—"}
        />
        <StatCard
          label="New"
          value={stats ? String(stats.byStatus.new) : "—"}
        />
        <StatCard
          label="Won"
          value={stats ? String(stats.byStatus.won) : "—"}
        />
        <StatCard label="Proven revenue" value={formatMoney(provenRevenue)} />
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                active
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span className="font-mono text-[10px] text-muted-foreground/80">
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </nav>

      {leadsQuery.isLoading && (
        <div className="mt-6 overflow-x-auto border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {[...Array(5)].map((_, i) => <SkeletonLeadRow key={i} />)}
            </tbody>
          </table>
        </div>
      )}

      {leadsQuery.isError && (
        <p className="mt-8 font-mono text-xs uppercase tracking-wider text-[color:var(--status-red)]">
          Failed to load leads.
        </p>
      )}

      {!leadsQuery.isLoading && all.length === 0 && (
        <div className="mt-8 border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            No leads yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Webhook leads will land here automatically. Use “Log lead” to
            record a call or walk-in.
          </p>
        </div>
      )}

      {!leadsQuery.isLoading && all.length > 0 && filtered.length === 0 && (
        <p className="mt-8 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          No leads match this filter.
        </p>
      )}

      {filtered.length > 0 && (
        <LeadsTable
          leads={filtered}
          tenantId={tenantId}
          onMarkWon={setWonLead}
          onStatusChanged={() => {
            qc.invalidateQueries({ queryKey: ["leads", tenantId] });
            qc.invalidateQueries({ queryKey: ["lead-stats", tenantId] });
          }}
        />
      )}

      <LogLeadDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        tenantId={tenantId}
      />
      <MarkWonDialog
        lead={wonLead}
        onClose={() => setWonLead(null)}
        tenantId={tenantId}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function LeadsTable({
  leads,
  tenantId,
  onMarkWon,
  onStatusChanged,
}: {
  leads: LeadSummary[];
  tenantId: string;
  onMarkWon: (l: LeadSummary) => void;
  onStatusChanged: () => void;
}) {
  return (
    <div className="mt-6 overflow-x-auto border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Date</th>
            <th className="px-4 py-2.5 text-left font-medium">Name</th>
            <th className="px-4 py-2.5 text-left font-medium">Source</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Service / location</th>
            <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              tenantId={tenantId}
              onMarkWon={() => onMarkWon(l)}
              onStatusChanged={onStatusChanged}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadRow({
  lead,
  tenantId,
  onMarkWon,
  onStatusChanged,
}: {
  lead: LeadSummary;
  tenantId: string;
  onMarkWon: () => void;
  onStatusChanged: () => void;
}) {
  const updateFn = useServerFn(updateLeadStatus);
  const statusMutation = useMutation({
    mutationFn: (status: LeadStatus) =>
      updateFn({ data: { tenantId, leadId: lead.id, status } }),
    onSuccess: () => {
      toast.success("Lead updated");
      onStatusChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const tone: StatusTone =
    lead.status === "won" ? "green"
    : lead.status === "lost" || lead.status === "junk" ? "neutral"
    : lead.status === "qualified" ? "info"
    : "amber";

  const service = (lead.attribution?.service as string | undefined) ?? null;
  const location = (lead.attribution?.location as string | undefined) ?? null;
  const serviceLocation = [service, location].filter(Boolean).join(" · ") || "—";

  const contact = lead.name ?? lead.email ?? lead.phone ?? "Unnamed lead";
  const subContact =
    lead.name && (lead.email || lead.phone) ? (lead.email ?? lead.phone) : null;

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/30">
      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
        {formatRelative(lead.createdAt)}
      </td>
      <td className="max-w-[18rem] px-4 py-3 align-top">
        <div className="truncate font-medium text-foreground">{contact}</div>
        {subContact && (
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {subContact}
          </div>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {lead.source ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <StatusPill tone={tone}>{lead.status}</StatusPill>
      </td>
      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
        {serviceLocation}
      </td>
      <td className="px-4 py-3 align-top text-right font-mono text-xs text-foreground">
        {lead.closedAmount != null ? formatMoney(lead.closedAmount) : "—"}
      </td>
      <td className="px-4 py-3 align-top text-right">
        <div className="flex items-center justify-end gap-1.5">
          {lead.status === "new" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("qualified")}
              >
                Qualify
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("junk")}
              >
                Junk
              </Button>
            </>
          )}
          {lead.status === "qualified" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                onClick={onMarkWon}
              >
                <Trophy className="h-3 w-3" />
                Won
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("lost")}
              >
                Lost
              </Button>
            </>
          )}
          {lead.status !== "new" && lead.status !== "qualified" && lead.status !== "won" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("new")}
            >
              Reopen
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function MarkWonDialog({
  lead,
  onClose,
  tenantId,
}: {
  lead: LeadSummary | null;
  onClose: () => void;
  tenantId: string;
}) {
  const queryClient = useQueryClient();
  const fn = useServerFn(markLeadWon);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { leadId: string; closedAmount: number; wonNotes?: string }) =>
      fn({
        data: {
          tenantId,
          leadId: input.leadId,
          closedAmount: input.closedAmount,
          wonNotes: input.wonNotes,
        },
      }),
    onSuccess: () => {
      toast.success("Lead marked won");
      queryClient.invalidateQueries({ queryKey: ["leads", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats", tenantId] });
      setAmount("");
      setNotes("");
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to mark won");
    },
  });

  const open = lead !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark lead won</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (!lead || !Number.isFinite(n) || n < 0) {
              toast.error("Enter a valid closed amount");
              return;
            }
            mutation.mutate({
              leadId: lead.id,
              closedAmount: n,
              wonNotes: notes.trim() || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="won-amount">Closed amount</Label>
            <Input
              id="won-amount"
              type="number"
              min={0}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="won-notes">Notes (optional)</Label>
            <Textarea
              id="won-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Service, location, anything worth remembering."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Mark won"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LogLeadDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
}) {
  const queryClient = useQueryClient();
  const fn = useServerFn(logLeadManually);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          tenantId,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          source: source.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Lead logged");
      queryClient.invalidateQueries({ queryKey: ["leads", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats", tenantId] });
      setName("");
      setEmail("");
      setPhone("");
      setSource("");
      setNotes("");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to log lead");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log lead manually</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() && !email.trim() && !phone.trim()) {
              toast.error("Add at least a name, email, or phone");
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name</Label>
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-source">Source</Label>
              <Input
                id="lead-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="phone, walk-in, referral…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input
                id="lead-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Service requested, urgency, etc."
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Log lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}
