-- Secure automatic maintenance reminders and post-service review requests.
-- Run after 202609040001_customer_equipment_service_records.sql.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'customer_followup_webhook_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'customer_followup_webhook_secret',
      'Authenticates database calls to the customer-followups Edge Function'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_followup_webhook_secret(supplied_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'customer_followup_webhook_secret'
      AND decrypted_secret = supplied_secret
      AND length(supplied_secret) >= 32
  );
$$;

REVOKE ALL ON FUNCTION validate_followup_webhook_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_followup_webhook_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION request_customer_followup(
  requested_action text,
  requested_appointment_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'customer_followup_webhook_secret'
  LIMIT 1;

  IF webhook_secret IS NULL THEN
    RAISE EXCEPTION 'Customer follow-up webhook secret is missing';
  END IF;

  PERFORM net.http_post(
    url := 'https://qsiimareoiyrkompuobi.supabase.co/functions/v1/customer-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_msZgwZ5Sascz_SYnTXQuQw_Km1k62pX',
      'x-followup-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'action', requested_action,
      'appointmentId', requested_appointment_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION request_customer_followup(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION queue_review_request_after_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.customer_id IS NOT NULL THEN
    PERFORM request_customer_followup('review_request', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_completed_review_request ON appointments;
CREATE TRIGGER appointment_completed_review_request
AFTER UPDATE OF status ON appointments
FOR EACH ROW
EXECUTE FUNCTION queue_review_request_after_completion();

DO $$
DECLARE
  existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job
  FROM cron.job
  WHERE jobname = 'daily-customer-maintenance-reminders';

  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;

  PERFORM cron.schedule(
    'daily-customer-maintenance-reminders',
    '0 15 * * *',
    $job$SELECT public.request_customer_followup('maintenance_scan', NULL);$job$
  );
END $$;
