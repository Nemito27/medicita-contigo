-- OPTIONAL: apply only in the NEW Medicita Contigo project, after migrations.
-- This is a server job; reminders do not depend on an open browser.
-- Inspect pg_available_extensions and the project's plan before enabling it.
create extension if not exists pg_cron with schema pg_catalog;

-- pg_cron updates an existing job with the same name and owner: re-running this
-- setup does not create duplicate reminder jobs.
select cron.schedule(
  'medicita-contigo-maintenance',
  '*/5 * * * *',
  'select public.run_maintenance();'
);

-- Verification (run as project owner, never from the public browser):
select jobid,jobname,schedule,active from cron.job
where jobname='medicita-contigo-maintenance';
-- Inspect cron.job_run_details for execution errors and public.system_runs for
-- successful runs. Disabling the job does not prevent expired offers from
-- becoming available: booking queries always validate expires_at directly.
-- To disable: select cron.unschedule('medicita-contigo-maintenance');
