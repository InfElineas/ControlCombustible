-- Precio de despacho por tipo de consumidor (valorización contable de beneficios)
CREATE TABLE IF NOT EXISTS precio_despacho_tipo (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_consumidor_id UUID     NOT NULL REFERENCES tipo_consumidor(id) ON DELETE CASCADE,
  combustible_id  UUID        REFERENCES tipo_combustible(id) ON DELETE SET NULL,
  precio_por_litro NUMERIC(12,4) NOT NULL,
  moneda          TEXT        NOT NULL DEFAULT 'CUP',
  fecha_desde     DATE        NOT NULL,
  created_date    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precio_despacho_tipo_tc ON precio_despacho_tipo(tipo_consumidor_id, fecha_desde DESC);
