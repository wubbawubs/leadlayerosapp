ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS closed_amount numeric,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS won_notes text;