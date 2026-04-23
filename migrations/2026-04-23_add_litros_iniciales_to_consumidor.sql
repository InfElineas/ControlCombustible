-- Add initial liters field for all consumer types.
ALTER TABLE consumidor
ADD COLUMN IF NOT EXISTS litros_iniciales numeric DEFAULT 0 NOT NULL;

-- Ensure existing rows are normalized (defensive).
UPDATE consumidor
SET litros_iniciales = 0
WHERE litros_iniciales IS NULL;
