-- Agregar número de factura a bonificaciones de trabajadores
-- Formato: C# donde # es secuencial por orden de fecha_venta + created_date

ALTER TABLE venta_trabajador ADD COLUMN IF NOT EXISTS numero_factura TEXT;

-- Índice único parcial (solo registros con número asignado)
CREATE UNIQUE INDEX IF NOT EXISTS idx_venta_trabajador_numero_factura
  ON venta_trabajador(numero_factura)
  WHERE numero_factura IS NOT NULL;

-- Backfill: asignar C1, C2, … a todos los registros existentes
-- ordenados por fecha_venta ASC, created_date ASC (mismo orden que muestra la tabla)
WITH ranked AS (
  SELECT id,
         'C' || ROW_NUMBER() OVER (ORDER BY fecha_venta ASC, created_date ASC) AS num
  FROM venta_trabajador
)
UPDATE venta_trabajador vt
SET numero_factura = r.num
FROM ranked r
WHERE vt.id = r.id;
