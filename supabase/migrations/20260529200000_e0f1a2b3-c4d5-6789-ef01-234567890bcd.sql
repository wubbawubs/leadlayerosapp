-- WordPress Delivery V2C — Publish from LeadLayer
-- Adds publish_source to distinguish operator-manual vs LeadLayer-initiated publish.

ALTER TABLE public.wordpress_drafts
  ADD COLUMN IF NOT EXISTS publish_source text
    CHECK (publish_source IN ('leadlayer_publish', 'operator_manual'));

COMMENT ON COLUMN public.wordpress_drafts.publish_source IS
  'leadlayer_publish = published via LeadLayer PATCH; operator_manual = published in WP admin and marked in LeadLayer.';
