UPDATE public.business_profile_analyzer_jobs
SET status = 'failed',
    error_message = COALESCE(error_message, 'Verlaten — runner is opnieuw opgestart.'),
    finished_at = COALESCE(finished_at, now())
WHERE status IN ('queued','running');