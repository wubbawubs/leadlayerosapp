/**
 * Job payload contracts — shared between the Lovable app and the external
 * Node worker (pg-boss + Playwright) that will live in its own repo.
 *
 * Every job MUST carry tenantId so the worker can scope its writes.
 * Add new jobs here and re-use these schemas on both sides.
 */
import { z } from "zod";

export const tenantPayload = z.object({
  tenantId: z.string().uuid(),
});

export const probeSitePayload = tenantPayload.extend({
  siteConnectionId: z.string().uuid().optional(),
  baseUrl: z.string().url(),
  applicationPassword: z.string().min(1).max(256).optional(),
  username: z.string().min(1).max(256).optional(),
});
export type ProbeSitePayload = z.infer<typeof probeSitePayload>;

export const baselineSnapshotPayload = tenantPayload.extend({
  siteConnectionId: z.string().uuid(),
});
export type BaselineSnapshotPayload = z.infer<typeof baselineSnapshotPayload>;

export const auditPayload = tenantPayload.extend({
  scanId: z.string().uuid(),
  pageUrls: z.array(z.string().url()).min(1).max(500).optional(),
});
export type AuditPayload = z.infer<typeof auditPayload>;

export const publishChangeGroupPayload = tenantPayload.extend({
  changeGroupId: z.string().uuid(),
});
export type PublishChangeGroupPayload = z.infer<typeof publishChangeGroupPayload>;

export const JOB_SCHEMAS = {
  probe_site: probeSitePayload,
  baseline_snapshot: baselineSnapshotPayload,
  audit: auditPayload,
  publish_change_group: publishChangeGroupPayload,
} as const;

export type JobName = keyof typeof JOB_SCHEMAS;

/**
 * Throw if the payload is missing tenantId. Used by the worker's enqueue()
 * to guarantee every job is scoped — and as a guard if we ever enqueue from
 * the app directly.
 */
export function assertTenantPayload(payload: unknown): { tenantId: string } {
  const parsed = tenantPayload.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Job payload missing tenantId");
  }
  return parsed.data;
}
