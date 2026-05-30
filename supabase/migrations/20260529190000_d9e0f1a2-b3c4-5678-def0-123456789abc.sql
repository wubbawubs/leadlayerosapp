-- WordPress Delivery V2B — SEO Meta Delivery
-- Adds SEO plugin meta tracking to wordpress_drafts.
-- seo_meta_status records whether meta was pushed, pending manual entry, or skipped.
-- meta_title / meta_description are copies from the artifact payload for reference.

ALTER TABLE public.wordpress_drafts
  ADD COLUMN IF NOT EXISTS seo_meta_status text
    CHECK (seo_meta_status IN ('pushed_yoast', 'pushed_rankmath', 'manual_required', 'skipped')),
  ADD COLUMN IF NOT EXISTS meta_title     text,
  ADD COLUMN IF NOT EXISTS meta_description text;

COMMENT ON COLUMN public.wordpress_drafts.seo_meta_status IS
  'pushed_yoast | pushed_rankmath | manual_required | skipped. Set during draft creation.';
COMMENT ON COLUMN public.wordpress_drafts.meta_title IS
  'Copy of artifact metaTitle at time of draft creation. Used for manual SEO checklist display.';
COMMENT ON COLUMN public.wordpress_drafts.meta_description IS
  'Copy of artifact metaDescription at time of draft creation.';
