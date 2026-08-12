-- Agrega fecha_hasta a precio_despacho_tipo para soportar historial de precios.
-- NULL = precio vigente sin fecha de cierre.
ALTER TABLE precio_despacho_tipo ADD COLUMN IF NOT EXISTS fecha_hasta DATE;
