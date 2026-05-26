-- Sprint E0 — Pre-Publishing Cleanup
-- Enforce: one active growth goal per tenant, one active masterplan per tenant.
-- Existing duplicate-active check was run prior to this migration and returned 0 rows.

CREATE UNIQUE INDEX IF NOT EXISTS growth_goals_one_active_per_tenant
  ON public.growth_goals (tenant_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS master_plans_one_active_per_tenant
  ON public.master_plans (tenant_id)
  WHERE status = 'active';