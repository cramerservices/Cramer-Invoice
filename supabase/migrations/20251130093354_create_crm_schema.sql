/*
  # CRM System Database Schema

  ## Overview
  Complete CRM system for managing customers, estimates, invoices, and payments.

  ## New Tables
  
  ### `customers`
  Customer database:
  - `id` (uuid, primary key) - Unique customer identifier
  - `name` (text) - Customer name
  - `email` (text, optional) - Customer email
  - `phone` (text, optional) - Customer phone number
  - `address` (text, optional) - Customer address
  - `notes` (text, optional) - Additional notes about customer
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `estimates`
  Estimates/quotes table:
  - `id` (uuid, primary key) - Unique estimate identifier
  - `estimate_number` (text) - Human-readable estimate number
  - `customer_id` (uuid, foreign key) - References customer
  - `estimate_date` (date) - Date estimate was created
  - `expiry_date` (date, optional) - When estimate expires
  - `status` (text) - Status: draft, sent, approved, rejected, expired
  - `tech_name` (text) - Technician name
  - `notes` (text, optional) - Additional notes
  - `total_amount` (numeric) - Total estimate amount
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `estimate_line_items`
  Line items for estimates:
  - `id` (uuid, primary key) - Unique line item identifier
  - `estimate_id` (uuid, foreign key) - References parent estimate
  - `description` (text) - Description of work or item
  - `material_cost` (numeric) - Cost of materials
  - `labor_cost` (numeric) - Cost of labor
  - `total_cost` (numeric) - Total for this line item
  - `sort_order` (integer) - Order of items
  - `created_at` (timestamptz) - Record creation timestamp

  ### `crm_invoices`
  Invoices table (renamed to avoid conflict):
  - `id` (uuid, primary key) - Unique invoice identifier
  - `invoice_number` (text) - Human-readable invoice number
  - `customer_id` (uuid, foreign key) - References customer
  - `estimate_id` (uuid, foreign key, optional) - References estimate if converted
  - `invoice_date` (date) - Date invoice was created
  - `due_date` (date) - Payment due date
  - `work_completed_date` (date) - Date work was completed
  - `status` (text) - Status: draft, sent, paid, partial, overdue, cancelled
  - `tech_name` (text) - Technician name
  - `notes` (text, optional) - Additional notes
  - `total_amount` (numeric) - Total invoice amount
  - `amount_paid` (numeric) - Amount paid so far
  - `amount_due` (numeric) - Amount still owed
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `crm_invoice_line_items`
  Line items for invoices:
  - `id` (uuid, primary key) - Unique line item identifier
  - `invoice_id` (uuid, foreign key) - References parent invoice
  - `description` (text) - Description of work or item
  - `material_cost` (numeric) - Cost of materials
  - `labor_cost` (numeric) - Cost of labor
  - `total_cost` (numeric) - Total for this line item
  - `sort_order` (integer) - Order of items
  - `created_at` (timestamptz) - Record creation timestamp

  ### `payments`
  Payment tracking:
  - `id` (uuid, primary key) - Unique payment identifier
  - `invoice_id` (uuid, foreign key) - References invoice
  - `payment_date` (date) - Date payment was received
  - `amount` (numeric) - Payment amount
  - `payment_method` (text) - Method: cash, check, card, transfer, other
  - `reference_number` (text, optional) - Check number, transaction ID, etc.
  - `notes` (text, optional) - Additional notes about payment
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on all tables
  - Public access policies for now (can be restricted later with auth)

  ## Indexes
  - Foreign key indexes for better query performance
  - Status indexes for filtering
  - Date indexes for reporting

  ## Notes
  - Cascade deletes: When customer/estimate/invoice deleted, related records are handled appropriately
  - Amount calculations are precise with NUMERIC(10,2)
  - Status fields use text for flexibility
*/

-- Drop old tables if they exist
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create estimates table
CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  estimate_date date NOT NULL,
  expiry_date date,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired')),
  tech_name text NOT NULL,
  notes text DEFAULT '',
  total_amount numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create estimate line items table
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  description text NOT NULL,
  material_cost numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS crm_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  work_completed_date date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled')),
  tech_name text NOT NULL,
  notes text DEFAULT '',
  total_amount numeric(10,2) DEFAULT 0,
  amount_paid numeric(10,2) DEFAULT 0,
  amount_due numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create invoice line items table
CREATE TABLE IF NOT EXISTS crm_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES crm_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  material_cost numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES crm_invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash', 'check', 'card', 'transfer', 'other')),
  reference_number text,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE INDEX IF NOT EXISTS idx_estimates_customer_id ON estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_estimate_date ON estimates(estimate_date);

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate_id ON estimate_line_items(estimate_id);

CREATE INDEX IF NOT EXISTS idx_crm_invoices_customer_id ON crm_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_estimate_id ON crm_invoices(estimate_id);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_status ON crm_invoices(status);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_invoice_date ON crm_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_due_date ON crm_invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_crm_invoice_line_items_invoice_id ON crm_invoice_line_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Create policies for customers table
CREATE POLICY "Allow public read access to customers"
  ON customers FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to customers"
  ON customers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to customers"
  ON customers FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to customers"
  ON customers FOR DELETE
  USING (true);

-- Create policies for estimates table
CREATE POLICY "Allow public read access to estimates"
  ON estimates FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to estimates"
  ON estimates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to estimates"
  ON estimates FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to estimates"
  ON estimates FOR DELETE
  USING (true);

-- Create policies for estimate_line_items table
CREATE POLICY "Allow public read access to estimate line items"
  ON estimate_line_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to estimate line items"
  ON estimate_line_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to estimate line items"
  ON estimate_line_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to estimate line items"
  ON estimate_line_items FOR DELETE
  USING (true);

-- Create policies for crm_invoices table
CREATE POLICY "Allow public read access to invoices"
  ON crm_invoices FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to invoices"
  ON crm_invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to invoices"
  ON crm_invoices FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to invoices"
  ON crm_invoices FOR DELETE
  USING (true);

-- Create policies for crm_invoice_line_items table
CREATE POLICY "Allow public read access to invoice line items"
  ON crm_invoice_line_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to invoice line items"
  ON crm_invoice_line_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to invoice line items"
  ON crm_invoice_line_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to invoice line items"
  ON crm_invoice_line_items FOR DELETE
  USING (true);

-- Create policies for payments table
CREATE POLICY "Allow public read access to payments"
  ON payments FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to payments"
  ON payments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to payments"
  ON payments FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to payments"
  ON payments FOR DELETE
  USING (true);
