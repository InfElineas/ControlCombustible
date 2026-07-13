-- Fix: DESPACHOs generados por bonificaciones apuntaban incorrectamente a
-- "Operaciones Logísticas VD" como consumidor destino, inflando su stock.
-- El combustible va directamente al trabajador; consumidor_id debe ser NULL.

UPDATE movimiento
SET
  consumidor_id    = NULL,
  vehiculo_chapa   = NULL
WHERE tipo       = 'DESPACHO'
  AND referencia ILIKE 'Bonificación combustible:%'
  AND consumidor_id IS NOT NULL;

-- Verificación: debe retornar 0 filas después de ejecutar el UPDATE
SELECT COUNT(*)
FROM movimiento
WHERE tipo       = 'DESPACHO'
  AND referencia ILIKE 'Bonificación combustible:%'
  AND consumidor_id IS NOT NULL;
