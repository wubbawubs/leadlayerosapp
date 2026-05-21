/**
 * SEO Proposal generator — server-only.
 * For an audit, walks each audit_page with issues, calls the LLM to produce
 * concrete fix proposals, validates against a Zod schema, and persists them.
 * Does NOT write anything back to WordPress.
 */
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { llmComplete } from "@/lib/shared/llm/router.server";

const ProposalSchema = z.object({
  proposal_type: z.enum(["meta_description", "alt_text", "schema", "title", "h1", "other"]),
  issue_code: z.string().min(1).max(64),
  before: z.record(z.string(), z.unknown()).default({}),
  after: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().min(10).max(800),
  confidence: z.number().min(0).max(1),
});

const ResponseSchema = z.object({
  proposals: z.array(ProposalSchema).min(0).max(10),
});

type AuditPageRow = {
  id: string;
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  images_without_alt: number;
  word_count: number;
  issues: Array<{ code: string; message?: string; count?: number }> | null;
  schema: unknown;
};

function buildPrompt(p: AuditPageRow): string {
  const issues = (p.issues ?? [])
    .map((i) => `- ${i.code}${i.message ? `: ${i.message}` : ""}`)
    .join("\n");
  return [
    `URL: ${p.url}`,
    `Title: ${p.title ?? "(none)"}`,
    `Meta description (${(p.meta_description ?? "").length} chars): ${p.meta_description ?? "(none)"}`,
    `H1: ${p.h1 ?? "(none)"}`,
    `Word count: ${p.word_count}`,
    `Images without alt: ${p.images_without_alt}`,
    `Has JSON-LD schema: ${p.schema ? "yes" : "no"}`,
    "",
    "Issues detected:",
    issues || "(none)",
    "",
    "Generate up to 5 concrete, actionable SEO fix proposals for this page.",
    "Each proposal must include: proposal_type, issue_code (matches issue), before, after, rationale, confidence (0-1).",
    "For meta_description, before={text:current} after={text:new 120-160 chars}.",
    "For alt_text, before={count:N} after={alts:[\"alt 1\",...]} with suggested generic alts.",
    "For schema, before={present:false} after={jsonld:{...}} with a minimal JSON-LD object.",
    "For title/h1, before={text:current} after={text:new}.",
    'Respond ONLY with valid JSON: {"proposals":[{...}]}. No prose, no markdown.',
  ].join("\n");
}

function extractJson(text: string): unknown {
  // Strip code fences if present
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(cleaned.slice(first, last + 1));
}

export async function generateProposalsForAudit(auditId: string): Promise<{
  groupsCreated: number;
  proposalsCreated: number;
  errors: number;
}> {
  const { data: audit, error: aErr } = await supabaseAdmin
    .from("audits")
    .select("id, tenant_id")
    .eq("id", auditId)
    .single();
  if (aErr || !audit) throw aErr ?? new Error("Audit not found");

  const { data: pages, error: pErr } = await supabaseAdmin
    .from("audit_pages")
    .select(
      "id, url, title, meta_description, h1, images_without_alt, word_count, issues, schema",
    )
    .eq("audit_id", auditId);
  if (pErr) throw pErr;

  let groupsCreated = 0;
  let proposalsCreated = 0;
  let errors = 0;

  for (const page of (pages ?? []) as AuditPageRow[]) {
    const issues = page.issues ?? [];
    if (issues.length === 0) continue;

    try {
      const result = await llmComplete({
        task: "cheap",
        system:
          "You are an expert SEO consultant. Output ONLY valid JSON matching the requested schema. Never include explanatory text.",
        prompt: buildPrompt(page),
        temperature: 0.3,
        maxTokens: 1500,
      });

      const parsed = ResponseSchema.parse(extractJson(result.text));
      if (parsed.proposals.length === 0) continue;

      const { data: group, error: gErr } = await supabaseAdmin
        .from("fix_proposal_groups")
        .insert({
          tenant_id: audit.tenant_id,
          audit_id: auditId,
          audit_page_id: page.id,
          theme: `Page: ${page.url}`,
          status: "draft",
        })
        .select("id")
        .single();
      if (gErr) throw gErr;
      groupsCreated += 1;

      const rows = parsed.proposals.map((pr) => ({
        tenant_id: audit.tenant_id,
        group_id: group.id,
        audit_page_id: page.id,
        issue_code: pr.issue_code,
        proposal_type: pr.proposal_type,
        before: pr.before as never,
        after: pr.after as never,
        rationale: pr.rationale,
        confidence: pr.confidence,
        status: "draft" as const,
      }));
      const { error: iErr } = await supabaseAdmin.from("fix_proposals").insert(rows);
      if (iErr) throw iErr;
      proposalsCreated += rows.length;

    } catch (e) {
      errors += 1;
      console.error("Proposal generation failed for page", page.url, e);
    }
  }

  return { groupsCreated, proposalsCreated, errors };
}
