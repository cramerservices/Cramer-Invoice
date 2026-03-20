ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2) NOT NULL DEFAULT 50;

ALTER TABLE estimates
DROP CONSTRAINT IF EXISTS estimates_deposit_percentage_range;

ALTER TABLE estimates
ADD CONSTRAINT estimates_deposit_percentage_range
CHECK (deposit_percentage >= 0 AND deposit_percentage <= 100);
