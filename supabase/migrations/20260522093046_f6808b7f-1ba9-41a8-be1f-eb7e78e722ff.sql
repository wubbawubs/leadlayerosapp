DROP INDEX IF EXISTS public.page_intelligence_tenant_page_uidx;
ALTER TABLE public.page_intelligence ADD CONSTRAINT page_intelligence_tenant_page_uniq UNIQUE (tenant_id, page_id);