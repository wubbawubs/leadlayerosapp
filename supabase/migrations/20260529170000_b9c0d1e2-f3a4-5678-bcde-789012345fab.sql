-- Delivery Proof V1
-- Add publish tracking columns to wordpress_drafts.
-- Publication is operator-confirmed (manual "Mark as published" action).
-- No automatic WP publish is ever triggered by this migration.

ALTER TABLE public.wordpress_drafts
  ADD COLUMN IF NOT EXISTS published_at     timestamptz,
  ADD COLUMN IF NOT EXISTS published_by     uuid,
  ADD COLUMN IF NOT EXISTS published_url    text,
  ADD COLUMN IF NOT EXISTS publication_notes text;

COMMENT ON COLUMN public.wordpress_drafts.published_at IS
  'Operator-confirmed publish timestamp. NULL = not yet published. Set via markWordpressDraftPublished.';
COMMENT ON COLUMN public.wordpress_drafts.published_by IS
  'auth.users.id of the operator who confirmed publication.';
COMMENT ON COLUMN public.wordpress_drafts.published_url IS
  'Live URL of the page after publication, if provided by the operator.';
COMMENT ON COLUMN public.wordpress_drafts.publication_notes IS
  'Optional operator notes recorded at the time of publication confirmation.';
