-- Sprint B: link proposal_v2 to masterplan items and growth goals

ALTER TABLE public.proposal_v2
  ADD COLUMN IF NOT EXISTS masterplan_item_id uuid NULL
    REFERENCES public.masterplan_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS growth_goal_id uuid NULL
    REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'audit_issue';

-- Existing audit-issue proposals require audit_id/page_id/issue_id, but
-- masterplan-origin proposals may have none. Relax NOT NULL.
ALTER TABLE public.proposal_v2
  ALTER COLUMN audit_id DROP NOT NULL,
  ALTER COLUMN page_id DROP NOT NULL,
  ALTER COLUMN issue_id DROP NOT NULL;

-- Enforce: an audit_issue proposal must still carry audit_id/page_id/issue_id;
-- a masterplan_item proposal must carry masterplan_item_id.
ALTER TABLE public.proposal_v2
  ADD CONSTRAINT proposal_v2_origin_fields_chk CHECK (
    (origin = 'audit_issue' AND audit_id IS NOT NULL AND page_id IS NOT NULL AND issue_id IS NOT NULL)
    OR (origin = 'masterplan_item' AND masterplan_item_id IS NOT NULL)
    OR (origin = 'manual')
  );

CREATE INDEX IF NOT EXISTS proposal_v2_tenant_masterplan_item_idx
  ON public.proposal_v2 (tenant_id, masterplan_item_id);
CREATE INDEX IF NOT EXISTS proposal_v2_tenant_origin_idx
  ON public.proposal_v2 (tenant_id, origin);