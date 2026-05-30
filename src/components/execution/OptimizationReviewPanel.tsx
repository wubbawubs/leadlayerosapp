import type { ExecutionBoardItem } from "@/lib/shared/execution/board.functions";
import { RiskFlags } from "./RiskFlags";
import { MissingContext } from "./MissingContext";

const UPDATE_MODE_LABEL: Record<string, string> = {
  full_content: "Full content update",
  meta_only: "Meta-only update (safe)",
  manual: "Manual mode (operator does it in WP)",
};

/**
 * Existing page optimization review panel — surfaces the optimization brief
 * fields the operator needs to read before applying. Reads exclusively from
 * ExecutionBoardItem.
 */
export function OptimizationReviewPanel({
  item,
}: {
  item: ExecutionBoardItem;
}) {
  if (!item.optimizationArtifactId) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        No optimization brief generated yet.
      </div>
    );
  }

  const hasAny =
    item.optimizationArtifactUpdateMode ||
    item.optimizationArtifactRecommendedTitle ||
    item.optimizationArtifactMetaTitle ||
    item.optimizationArtifactMetaDescription ||
    (item.optimizationArtifactOperatorChecklist?.length ?? 0) > 0;

  if (!hasAny) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Review details unavailable — re-generate the optimization brief to populate review fields.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--status-info)]">
          Optimization review
        </span>
        {item.optimizationArtifactUpdateMode && (
          <span className="text-xs text-muted-foreground">
            Mode:{" "}
            <span className="font-medium text-foreground">
              {UPDATE_MODE_LABEL[item.optimizationArtifactUpdateMode] ??
                item.optimizationArtifactUpdateMode}
            </span>
          </span>
        )}
      </div>

      {item.optimizationArtifactRecommendedTitle && (
        <Field label="Recommended H1 / title">
          {item.optimizationArtifactRecommendedTitle}
        </Field>
      )}
      {item.optimizationArtifactMetaTitle && (
        <Field
          label="Meta title"
          hint={`${item.optimizationArtifactMetaTitle.length}/70`}
        >
          {item.optimizationArtifactMetaTitle}
        </Field>
      )}
      {item.optimizationArtifactMetaDescription && (
        <Field
          label="Meta description"
          hint={`${item.optimizationArtifactMetaDescription.length}/160`}
        >
          {item.optimizationArtifactMetaDescription}
        </Field>
      )}

      {item.optimizationArtifactOperatorChecklist &&
        item.optimizationArtifactOperatorChecklist.length > 0 && (
          <Field label="Operator checklist">
            <ul className="space-y-1 text-sm text-foreground">
              {item.optimizationArtifactOperatorChecklist.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Field>
        )}

      <RiskFlags flags={item.optimizationArtifactRiskFlags} />
      <MissingContext items={item.optimizationArtifactMissingContext} />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint && (
          <p className="font-mono text-[10px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}
