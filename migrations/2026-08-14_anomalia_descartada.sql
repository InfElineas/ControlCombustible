-- Permite marcar una anomalia concreta como revisada y correcta, para que deje
-- de aparecer en el panel de integridad.
--
-- Motivo: las comprobaciones son heuristicas y algunos aciertos aparentes no lo
-- son. El caso que origino esto fueron dos bonificaciones identicas registradas
-- con segundos de diferencia, que parecian un doble envio y resultaron ser dos
-- facturas reales confirmadas por caja. Sin una via para descartarlas, esos
-- avisos se quedan fijos y el panel pierde utilidad.
--
-- La clave identifica el caso concreto e incluye la magnitud, de modo que si el
-- caso cambia (por ejemplo aparece un tercer registro en un grupo duplicado, o
-- varia el descuadre de un tanque) el aviso vuelve a mostrarse en lugar de
-- quedar silenciado para siempre.

CREATE TABLE IF NOT EXISTS anomalia_descartada (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL,
  clave        TEXT NOT NULL,
  motivo       TEXT,
  user_id      UUID,
  user_email   TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clave)
);

CREATE INDEX IF NOT EXISTS idx_anomalia_descartada_tipo ON anomalia_descartada (tipo);

COMMENT ON TABLE anomalia_descartada IS
  'Anomalias del panel de integridad revisadas y confirmadas como correctas. La clave incluye la magnitud del caso para que el aviso reaparezca si cambia.';

ALTER TABLE anomalia_descartada ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "anomalia_descartada_select_all"  ON anomalia_descartada;
  DROP POLICY IF EXISTS "anomalia_descartada_insert_ops"  ON anomalia_descartada;
  DROP POLICY IF EXISTS "anomalia_descartada_delete_ops"  ON anomalia_descartada;

  -- Lectura abierta: el auditor debe ver que un aviso fue descartado y por quien
  CREATE POLICY "anomalia_descartada_select_all" ON anomalia_descartada
    FOR SELECT TO authenticated USING (true);

  -- Descartar y restaurar es operar, no auditar: fuera auditor y cajero
  CREATE POLICY "anomalia_descartada_insert_ops" ON anomalia_descartada
    FOR INSERT TO authenticated
    WITH CHECK (get_my_role() IN ('superadmin', 'operador', 'economico'));

  CREATE POLICY "anomalia_descartada_delete_ops" ON anomalia_descartada
    FOR DELETE TO authenticated
    USING (get_my_role() IN ('superadmin', 'operador', 'economico'));
END $$;
