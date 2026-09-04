-- Staff-managed equipment, tune-up records, photos, and follow-up tracking.

CREATE TABLE IF NOT EXISTS customer_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  equipment_type text NOT NULL,
  location text,
  manufacturer text,
  model_number text,
  serial_number text,
  installed_on date,
  warranty_expires_on date,
  filter_size text,
  refrigerant_type text,
  last_service_date date,
  next_service_due date,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  appointment_id uuid,
  equipment_id uuid REFERENCES customer_equipment(id) ON DELETE SET NULL,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  service_type text NOT NULL DEFAULT 'Tune-Up',
  technician_name text,
  summary text,
  recommendations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_record_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_record_id uuid NOT NULL REFERENCES customer_service_records(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_followup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  appointment_id uuid,
  equipment_id uuid REFERENCES customer_equipment(id) ON DELETE CASCADE,
  followup_type text NOT NULL CHECK (followup_type IN ('maintenance_reminder', 'review_request')),
  delivery_status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_customer_equipment_customer ON customer_equipment(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_equipment_due ON customer_equipment(next_service_due);
CREATE INDEX IF NOT EXISTS idx_service_records_customer ON customer_service_records(customer_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_service_photos_record ON service_record_photos(service_record_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_review_request_per_appointment
  ON customer_followup_log(appointment_id, followup_type)
  WHERE appointment_id IS NOT NULL AND followup_type = 'review_request';
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_maintenance_reminder_per_due_date
  ON customer_followup_log(equipment_id, followup_type, ((details->>'due_date')))
  WHERE equipment_id IS NOT NULL AND followup_type = 'maintenance_reminder';

ALTER TABLE customer_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_record_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_followup_log ENABLE ROW LEVEL SECURITY;

-- These policies match the CRM's existing public CRUD model. Restrict these to a
-- staff role when CRM authentication is added.
CREATE POLICY "CRM can manage equipment" ON customer_equipment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "CRM can manage service records" ON customer_service_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "CRM can manage service photos" ON service_record_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "CRM can read followups" ON customer_followup_log FOR SELECT USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-service-photos', 'customer-service-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "CRM can upload customer service photos"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'customer-service-photos');
CREATE POLICY "Public can view customer service photos"
  ON storage.objects FOR SELECT USING (bucket_id = 'customer-service-photos');
CREATE POLICY "CRM can update customer service photos"
  ON storage.objects FOR UPDATE USING (bucket_id = 'customer-service-photos');
CREATE POLICY "CRM can delete customer service photos"
  ON storage.objects FOR DELETE USING (bucket_id = 'customer-service-photos');
