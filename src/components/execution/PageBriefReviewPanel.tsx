import type { ExecutionBoardItem } from "@/lib/shared/execution/board.functions";
import { RiskFlags } from "./RiskFlags";
import { MissingContext } from "./MissingContext";

/**
 * Page brief review panel — surfaces every brief field the operator needs to
 * read before approving. Reads exclusively from ExecutionBoardItem fields
 * (no extra fetches).
 */
export function PageBriefReviewPanel({ item }: { item: ExecutionBoardItem }) {
  const hasAny =
    item.artifactPrimaryKeyword ||
    item.artifactH1 ||
    item.artifactMetaTitle ||
    item.artifactMetaDescription ||
    item.artifactIntroPreview ||
    item.artifactOperatorNotes ||
    item.artifactSectionCount > 0 ||
    item.artifactFaqCount > 0;

  if (!item.artifactId) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        No page brief generated yet.
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Review details unavailable — re-generate the brief to populate review fields.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Eyebrow>Page brief review</Eyebrow>
        {item.artifactPrimaryKeyword && (
          <span className="text-xs text-muted-foreground">
            Primary keyword:{" "}
            <span className="font-medium text-foreground">
              {item.artifactPrimaryKeyword}
            </span>
            {item.artifactKeywordVolume != null && (
              <span className="text-muted-foreground">
                {" · "}{item.artifactKeywordVolume.toLocaleString()} searches/mo
              </span>
            )}
          </span>
        )}
      </div>

      {item.artifactH1 && <Field label="H1">{item.artifactH1}</Field>}
      {item.artifactMetaTitle && (
        <Field label="Meta title" hint={`${item.artifactMetaTitle.length}/70`}>
          {item.artifactMetaTitle}
        </Field>
      )}
      {item.artifactMetaDescription && (
        <Field
          label="Meta description"
          hint={`${item.artifactMetaDescription.length}/160`}
        >
          {item.artifactMetaDescription}
        </Field>
      )}

      {item.artifactIntroPreview && (
        <Field label="Intro preview">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {item.artifactIntroPreview}
          </p>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <StatTile label="Sections" value={item.artifactSectionCount} />
        <StatTile label="FAQs" value={item.artifactFaqCount} />
      </div>

      {item.artifactOperatorNotes && (
        <Field label="Operator notes">
          <p className="whitespace-pre-line text-sm text-foreground">
            {item.artifactOperatorNotes}
          </p>
        </Field>
      )}

      <RiskFlags flags={item.artifactRiskFlags} />
      <MissingContext items={item.artifactMissingContext} />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--status-info)]">
      {children}
    </span>
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-background/60 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-lg text-foreground">{value}</p>
    </div>
  );
}
