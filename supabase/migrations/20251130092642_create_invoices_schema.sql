/*
  # Invoice Management System Schema

  ## Overview
  Creates tables for managing invoices with line items that can track material and labor costs separately.

  ## New Tables
  
  ### `invoices`
  Main invoice table containing:
  - `id` (uuid, primary key) - Unique invoice identifier
  - `invoice_number` (text) - Human-readable invoice number
  - `work_completed_date` (date) - Date when the work was completed
  - `invoice_date` (date) - Date when invoice was created
  - `customer_name` (text) - Name of the customer
  - `customer_address` (text) - Customer's address
  - `tech_name` (text) - Name of the technician who did the work
  - `notes` (text, optional) - Additional notes or comments
  - `total_amount` (decimal) - Total invoice amount
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `invoice_line_items`
  Line items for each invoice:
  - `id` (uuid, primary key) - Unique line item identifier
  - `invoice_id` (uuid, foreign key) - References parent invoice
  - `description` (text) - Description of work or item
  - `material_cost` (decimal) - Cost of materials
  - `labor_cost` (decimal) - Cost of labor
  - `total_cost` (decimal) - Total for this line item (material + labor)
  - `sort_order` (integer) - Order of items in the invoice
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on both tables
  - Public access for now (can be restricted later with auth)
  - Policies allow full CRUD operations

  ## Notes
  - Cascade delete: When an invoice is deleted, all its line items are automatically deleted
  - Total amounts are stored as NUMERIC(10,2) for precise decimal handling
  - Invoice numbers can be auto-generated or manually entered
*/

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  work_completed_date date NOT NULL,
  invoice_date date NOT NULL,
  customer_name text NOT NULL,
  customer_address text NOT NULL,
  tech_name text NOT NULL,
  notes text DEFAULT '',
  total_amount numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create invoice line items table
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  material_cost numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

-- Enable Row Level Security
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Create policies for invoices table
CREATE POLICY "Allow public read access to invoices"
  ON invoices FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to invoices"
  ON invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to invoices"
  ON invoices FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to invoices"
  ON invoices FOR DELETE
  USING (true);

-- Create policies for invoice_line_items table
CREATE POLICY "Allow public read access to line items"
  ON invoice_line_items FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to line items"
  ON invoice_line_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to line items"
  ON invoice_line_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to line items"
  ON invoice_line_items FOR DELETE
  USING (true);
