-- Revenue Chain V1
-- Add closed revenue tracking columns to leads.
-- Values are operator-recorded via markLeadWon; never auto-populated.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS closed_amount    numeric,
  ADD COLUMN IF NOT EXISTS close_probability numeric
    CONSTRAINT leads_close_probability_range
    CHECK (close_probability IS NULL OR (close_probability >= 0 AND close_probability <= 1)),
  ADD COLUMN IF NOT EXISTS closed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS won_notes        text;

COMMENT ON COLUMN public.leads.closed_amount IS
  'Operator-recorded closed deal value. Required when status transitions to won.';
COMMENT ON COLUMN public.leads.close_probability IS
  'Estimated close probability (0.0–1.0). Used for pipeline revenue projection.';
COMMENT ON COLUMN public.leads.closed_at IS
  'Timestamp when the deal was marked as won via markLeadWon.';
COMMENT ON COLUMN public.leads.won_notes IS
  'Optional operator notes recorded at close (service scope, deal context, etc.).';
