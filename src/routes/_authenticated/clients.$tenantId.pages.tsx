import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Eye, Pencil, Rocket, FileText, Sparkles } from "lucide-react";

import {
  getPageInventory,
  type PageInventoryItem,
} from "@/lib/shared/wordpressDrafts/pageInventory.functions";
import { publishWordpressDraftFromLeadLayer } from "@/lib/shared/wordpressDrafts/wordpressDrafts.functions";
import { StatusPill, type StatusTone } from "@/components/execution/StatusPill";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/clients/$tenantId/pages")({
  component: PagesTab,
  head: () => ({ meta: [{ title: "Pages — LeadLayer" }] }),
});

type Filter = "all" | "live" | "draft" | "optimized" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "draft", label: "Draft" },
  { id: "optimized", label: "Optimized" },
  { id: "failed", label: "Failed" },
];

function PagesTab() {
  const { tenantId } = Route.useParams();
  const fetchInventory = useServerFn(getPageInventory);
  const inventoryQuery = useQuery({
    queryKey: ["page-inventory", tenantId],
    queryFn: () => fetchInventory({ data: { tenantId } }),
  });
  const [filter, setFilter] = useState<Filter>("all");

  const all = inventoryQuery.data?.pages ?? [];
  const counts = {
    all: all.length,
    live: all.filter((p) => p.status === "live").length,
    draft: all.filter((p) => p.status === "draft").length,
    optimized: all.filter((p) => p.type === "optimized").length,
    failed: all.filter((p) => p.status === "failed").length,
  };
  const filtered = all.filter((p) => {
    if (filter === "all") return true;
    if (filter === "optimized") return p.type === "optimized";
    return p.status === filter;
  });

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <div className="border-b border-border pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          § Pages · WordPress inventory
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          Page inventory
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          New pages built by LeadLayer and existing pages optimized through the
          execution board. Source of truth is WordPress.
        </p>
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

      {inventoryQuery.isLoading && (
        <p className="mt-8 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Loading inventory…
        </p>
      )}

      {inventoryQuery.isError && (
        <p className="mt-8 font-mono text-xs uppercase tracking-wider text-[color:var(--status-red)]">
          Failed to load page inventory.
        </p>
      )}

      {!inventoryQuery.isLoading && all.length === 0 && (
        <div className="mt-8 border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            No pages yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            No pages yet. Review and publish the first page from Execution.
          </p>
        </div>
      )}

      {!inventoryQuery.isLoading && all.length > 0 && filtered.length === 0 && (
        <p className="mt-8 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          No pages match this filter.
        </p>
      )}

      {filtered.length > 0 && (
        <PageInventoryTable tenantId={tenantId} pages={filtered} />
      )}
    </div>
  );
}

function PageInventoryTable({
  tenantId,
  pages,
}: {
  tenantId: string;
  pages: PageInventoryItem[];
}) {
  return (
    <div className="mt-6 overflow-x-auto border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Page</th>
            <th className="px-4 py-2.5 text-left font-medium">Type</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">SEO meta</th>
            <th className="px-4 py-2.5 text-left font-medium">Last action</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <PageRow key={p.id} tenantId={tenantId} page={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageRow({
  tenantId,
  page,
}: {
  tenantId: string;
  page: PageInventoryItem;
}) {
  const queryClient = useQueryClient();
  const publishFn = useServerFn(publishWordpressDraftFromLeadLayer);
  const publishMutation = useMutation({
    mutationFn: () =>
      publishFn({ data: { tenantId, draftId: page.id } }),
    onSuccess: () => {
      toast.success("Page published");
      queryClient.invalidateQueries({ queryKey: ["page-inventory", tenantId] });
    },
    onError: (e: unknown) => {
      toast.error(
        e instanceof Error ? e.message : "Failed to publish page",
      );
    },
  });

  const statusTone: StatusTone =
    page.status === "live" ? "green"
    : page.status === "failed" ? "red"
    : "amber";

  const isNewDraft =
    page.source === "leadlayer_new" && page.status === "draft";

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/30">
      <td className="max-w-[28rem] px-4 py-3 align-top">
        <div className="flex items-start gap-2">
          {page.type === "optimized" ? (
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          ) : (
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {page.title ?? "Untitled"}
            </div>
            {page.slug && (
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                /{page.slug}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {page.type === "optimized" ? "Optimized" : "New page"}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <StatusPill tone={statusTone}>{page.status}</StatusPill>
      </td>
      <td className="px-4 py-3 align-top">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {page.seoMetaStatus ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
        {formatRelative(page.lastActionAt)}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {page.url && (
            <RowAction href={page.url} icon={ExternalLink} label="Live" />
          )}
          {page.wpPreviewLink && (
            <RowAction href={page.wpPreviewLink} icon={Eye} label="Preview" />
          )}
          {page.wpEditLink && (
            <RowAction href={page.wpEditLink} icon={Pencil} label="Edit in WP" />
          )}
          {isNewDraft && (
            <Button
              size="sm"
              variant="default"
              className="h-7 gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]"
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              <Rocket className="h-3 w-3" />
              {publishMutation.isPending ? "Publishing…" : "Publish"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RowAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ExternalLink;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-accent hover:text-foreground"
    >
      <Icon className="h-3 w-3" />
      {label}
    </a>
  );
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
