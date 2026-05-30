-- Dashboard pre-requisites: growth_goals extensions
-- Adds tier, notification settings, call scheduling

ALTER TABLE public.growth_goals
  ADD COLUMN IF NOT EXISTS tier text
    CHECK (tier IN ('foundation', 'growth', 'authority')),
  ADD COLUMN IF NOT EXISTS notification_email text,
  ADD COLUMN IF NOT EXISTS notify_on_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_cadence text
    CHECK (call_cadence IN ('monthly', 'quarterly', 'biweekly'));

COMMENT ON COLUMN public.growth_goals.tier IS
  'Service tier: foundation | growth | authority. Set by operator at goal creation.';
COMMENT ON COLUMN public.growth_goals.notification_email IS
  'Email address to notify when a new lead arrives via webhook.';
COMMENT ON COLUMN public.growth_goals.notify_on_lead IS
  'If true, send email to notification_email on every new webhook lead.';
COMMENT ON COLUMN public.growth_goals.next_call_at IS
  'Timestamp of next scheduled strategy call with the client.';
COMMENT ON COLUMN public.growth_goals.call_cadence IS
  'How often strategy calls are scheduled: monthly | quarterly | biweekly.';
