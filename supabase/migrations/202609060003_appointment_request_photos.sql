-- Photos customers submit while scheduling service.

CREATE TABLE IF NOT EXISTS appointment_request_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_request_photos_appointment
  ON appointment_request_photos(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_request_photos_customer
  ON appointment_request_photos(customer_id, created_at DESC);

ALTER TABLE appointment_request_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage appointment request photos"
  ON appointment_request_photos;
DROP POLICY IF EXISTS "Customers read own appointment request photos"
  ON appointment_request_photos;

CREATE POLICY "Staff manage appointment request photos"
  ON appointment_request_photos
  FOR ALL TO authenticated
  USING (is_crm_staff())
  WITH CHECK (is_crm_staff());

CREATE POLICY "Customers read own appointment request photos"
  ON appointment_request_photos
  FOR SELECT TO authenticated
  USING (customer_id = current_crm_customer_id());
