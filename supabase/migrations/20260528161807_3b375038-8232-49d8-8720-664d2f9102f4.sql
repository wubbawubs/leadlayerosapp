
-- Clear all run/analysis data for tenant Dallas Comfort Air so user can re-trigger flow
DO $$
DECLARE
  t uuid := 'b984de59-b75e-48ab-a10b-74d58a746f67';
BEGIN
  DELETE FROM public.proposal_comparisons WHERE tenant_id = t;
  DELETE FROM public.fix_proposals WHERE tenant_id = t;
  DELETE FROM public.fix_proposal_groups WHERE tenant_id = t;
  DELETE FROM public.changes WHERE tenant_id = t;
  DELETE FROM public.change_groups WHERE tenant_id = t;
  DELETE FROM public.page_intelligence WHERE tenant_id = t;
  DELETE FROM public.page_snapshots WHERE tenant_id = t;
  DELETE FROM public.audit_pages WHERE tenant_id = t;
  DELETE FROM public.issues WHERE tenant_id = t;
  DELETE FROM public.audits WHERE tenant_id = t;
  DELETE FROM public.pages WHERE tenant_id = t;
  DELETE FROM public.competitor_serp_results WHERE tenant_id = t;
  DELETE FROM public.competitors WHERE tenant_id = t;
  DELETE FROM public.competitor_scans WHERE tenant_id = t;
  DELETE FROM public.market_demand_clusters WHERE tenant_id = t;
  DELETE FROM public.market_keywords WHERE tenant_id = t;
  DELETE FROM public.market_scans WHERE tenant_id = t;
  DELETE FROM public.gbp_profiles WHERE tenant_id = t;
  DELETE FROM public.masterplan_items WHERE tenant_id = t;
  DELETE FROM public.master_plans WHERE tenant_id = t;
  DELETE FROM public.business_profile_feedback WHERE tenant_id = t;
  DELETE FROM public.business_profile_suggestions WHERE tenant_id = t;
  DELETE FROM public.business_profile_analyzer_jobs WHERE tenant_id = t;
  DELETE FROM public.business_profiles_v2 WHERE tenant_id = t;
  DELETE FROM public.business_profiles WHERE tenant_id = t;
  DELETE FROM public.brand_voice_profiles WHERE tenant_id = t;
  DELETE FROM public.lead_events WHERE tenant_id = t;
  DELETE FROM public.leads WHERE tenant_id = t;
  DELETE FROM public.health_scores WHERE tenant_id = t;
  DELETE FROM public.growth_goals WHERE tenant_id = t;
END $$;
