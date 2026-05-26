
DO $$
DECLARE
  v_tenant uuid := '4c04edfb-8731-47fa-8a27-5b1ebbce786c';
  v_user_ids uuid[];
BEGIN
  SELECT array_agg(user_id) INTO v_user_ids FROM public.memberships WHERE tenant_id = v_tenant;

  -- tenant-scoped data
  DELETE FROM public.lead_events WHERE tenant_id = v_tenant;
  DELETE FROM public.leads WHERE tenant_id = v_tenant;
  DELETE FROM public.raw_events WHERE tenant_id = v_tenant;
  DELETE FROM public.proposal_quality_checks WHERE tenant_id = v_tenant;
  DELETE FROM public.proposal_comparisons WHERE tenant_id = v_tenant;
  DELETE FROM public.proposal_v2 WHERE tenant_id = v_tenant;
  DELETE FROM public.fix_proposals WHERE tenant_id = v_tenant;
  DELETE FROM public.fix_proposal_groups WHERE tenant_id = v_tenant;
  DELETE FROM public.changes WHERE tenant_id = v_tenant;
  DELETE FROM public.change_groups WHERE tenant_id = v_tenant;
  DELETE FROM public.masterplan_items WHERE tenant_id = v_tenant;
  DELETE FROM public.master_plans WHERE tenant_id = v_tenant;
  DELETE FROM public.growth_goals WHERE tenant_id = v_tenant;
  DELETE FROM public.page_intelligence WHERE tenant_id = v_tenant;
  DELETE FROM public.page_snapshots WHERE tenant_id = v_tenant;
  DELETE FROM public.audit_pages WHERE tenant_id = v_tenant;
  DELETE FROM public.audits WHERE tenant_id = v_tenant;
  DELETE FROM public.pages WHERE tenant_id = v_tenant;
  DELETE FROM public.issues WHERE tenant_id = v_tenant;
  DELETE FROM public.scans WHERE tenant_id = v_tenant;
  DELETE FROM public.health_scores WHERE tenant_id = v_tenant;
  DELETE FROM public.business_profile_feedback WHERE tenant_id = v_tenant;
  DELETE FROM public.business_profile_suggestions WHERE tenant_id = v_tenant;
  DELETE FROM public.business_profile_analyzer_jobs WHERE tenant_id = v_tenant;
  DELETE FROM public.business_profiles_v2 WHERE tenant_id = v_tenant;
  DELETE FROM public.business_profiles WHERE tenant_id = v_tenant;
  DELETE FROM public.tone_feedback_examples WHERE tenant_id = v_tenant;
  DELETE FROM public.tone_profile_samples WHERE tenant_id = v_tenant;
  DELETE FROM public.brand_voice_profiles WHERE tenant_id = v_tenant;
  DELETE FROM public.site_connections WHERE tenant_id = v_tenant;
  DELETE FROM public.tenant_secrets WHERE tenant_id = v_tenant;
  DELETE FROM public.secret_audit_log WHERE tenant_id = v_tenant;
  DELETE FROM public.onboarding_sessions WHERE tenant_id = v_tenant;

  -- drop ownership-protection trigger payload by removing memberships directly
  ALTER TABLE public.memberships DISABLE TRIGGER USER;
  DELETE FROM public.memberships WHERE tenant_id = v_tenant;
  ALTER TABLE public.memberships ENABLE TRIGGER USER;

  DELETE FROM public.tenants WHERE id = v_tenant;

  -- delete user accounts (cascades to profiles, onboarding_sessions, auth.identities, auth.sessions)
  IF v_user_ids IS NOT NULL THEN
    DELETE FROM public.onboarding_sessions WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.profiles WHERE id = ANY(v_user_ids);
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END $$;
