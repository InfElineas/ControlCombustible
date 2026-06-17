-- Adjuntos en movimientos
ALTER TABLE movimiento ADD COLUMN IF NOT EXISTS adjunto_url TEXT;
ALTER TABLE movimiento ADD COLUMN IF NOT EXISTS adjunto_nombre TEXT;
