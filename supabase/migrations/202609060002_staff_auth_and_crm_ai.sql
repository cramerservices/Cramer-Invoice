-- Staff roles, CRM AI audit history, and private CRM table policies.

UPDATE profiles SET role = 'admin', updated_at = now()
WHERE lower(email) = 'cramerservicesllc@gmail.com';

CREATE OR REPLACE FUNCTION is_crm_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE auth_user_id = auth.uid()
      AND lower(coalesce(role, '')) IN ('admin', 'staff', 'technician', 'tech')
  ) OR lower(coalesce(auth.jwt()->>'email', '')) = 'cramerservicesllc@gmail.com';
$$;

CREATE OR REPLACE FUNCTION current_crm_customer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT customer_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS crm_ai_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  question text NOT NULL,
  matched_customer_ids uuid[] NOT NULL DEFAULT '{}',
  answer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_ai_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read AI query history" ON crm_ai_queries FOR SELECT TO authenticated USING (is_crm_staff());

-- Remove the original anonymous CRM policies.
DROP POLICY IF EXISTS "Allow public read access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public insert access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public update access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public delete access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public read access to estimates" ON estimates;
DROP POLICY IF EXISTS "Allow public insert access to estimates" ON estimates;
DROP POLICY IF EXISTS "Allow public update access to estimates" ON estimates;
DROP POLICY IF EXISTS "Allow public delete access to estimates" ON estimates;
DROP POLICY IF EXISTS "Allow public read access to estimate line items" ON estimate_line_items;
DROP POLICY IF EXISTS "Allow public insert access to estimate line items" ON estimate_line_items;
DROP POLICY IF EXISTS "Allow public update access to estimate line items" ON estimate_line_items;
DROP POLICY IF EXISTS "Allow public delete access to estimate line items" ON estimate_line_items;
DROP POLICY IF EXISTS "Allow public read access to invoices" ON crm_invoices;
DROP POLICY IF EXISTS "Allow public insert access to invoices" ON crm_invoices;
DROP POLICY IF EXISTS "Allow public update access to invoices" ON crm_invoices;
DROP POLICY IF EXISTS "Allow public delete access to invoices" ON crm_invoices;
DROP POLICY IF EXISTS "Allow public read access to invoice line items" ON crm_invoice_line_items;
DROP POLICY IF EXISTS "Allow public insert access to invoice line items" ON crm_invoice_line_items;
DROP POLICY IF EXISTS "Allow public update access to invoice line items" ON crm_invoice_line_items;
DROP POLICY IF EXISTS "Allow public delete access to invoice line items" ON crm_invoice_line_items;
DROP POLICY IF EXISTS "Allow public read access to payments" ON payments;
DROP POLICY IF EXISTS "Allow public insert access to payments" ON payments;
DROP POLICY IF EXISTS "Allow public update access to payments" ON payments;
DROP POLICY IF EXISTS "Allow public delete access to payments" ON payments;

DROP POLICY IF EXISTS "CRM can manage equipment" ON customer_equipment;
DROP POLICY IF EXISTS "CRM can manage service records" ON customer_service_records;
DROP POLICY IF EXISTS "CRM can manage service photos" ON service_record_photos;
DROP POLICY IF EXISTS "CRM can read followups" ON customer_followup_log;

CREATE POLICY "Staff manage customers" ON customers FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own CRM customer" ON customers FOR SELECT TO authenticated USING (id = current_crm_customer_id());
CREATE POLICY "Customers update own CRM customer" ON customers FOR UPDATE TO authenticated USING (id = current_crm_customer_id()) WITH CHECK (id = current_crm_customer_id());
CREATE POLICY "Staff manage estimates" ON estimates FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own estimates" ON estimates FOR SELECT TO authenticated USING (customer_id = current_crm_customer_id());
CREATE POLICY "Customers respond to own estimates" ON estimates FOR UPDATE TO authenticated USING (customer_id = current_crm_customer_id()) WITH CHECK (customer_id = current_crm_customer_id());
CREATE POLICY "Staff manage estimate items" ON estimate_line_items FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own estimate items" ON estimate_line_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_id AND e.customer_id = current_crm_customer_id()));
CREATE POLICY "Staff manage invoices" ON crm_invoices FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own invoices" ON crm_invoices FOR SELECT TO authenticated USING (customer_id = current_crm_customer_id());
CREATE POLICY "Staff manage invoice items" ON crm_invoice_line_items FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own invoice items" ON crm_invoice_line_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM crm_invoices i WHERE i.id = invoice_id AND i.customer_id = current_crm_customer_id()));
CREATE POLICY "Staff manage payments" ON payments FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own payments" ON payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM crm_invoices i WHERE i.id = invoice_id AND i.customer_id = current_crm_customer_id()));
CREATE POLICY "Staff manage equipment" ON customer_equipment FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own equipment" ON customer_equipment FOR SELECT TO authenticated USING (customer_id = current_crm_customer_id());
CREATE POLICY "Staff manage service records" ON customer_service_records FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own service records" ON customer_service_records FOR SELECT TO authenticated USING (customer_id = current_crm_customer_id());
CREATE POLICY "Staff manage service photos" ON service_record_photos FOR ALL TO authenticated USING (is_crm_staff()) WITH CHECK (is_crm_staff());
CREATE POLICY "Customers read own service photos" ON service_record_photos FOR SELECT TO authenticated USING (customer_id = current_crm_customer_id());
CREATE POLICY "Staff read followups" ON customer_followup_log FOR SELECT TO authenticated USING (is_crm_staff());
