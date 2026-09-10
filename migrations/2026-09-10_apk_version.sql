-- Publicación de versiones de la aplicación móvil desde el panel de
-- administración: el archivo y sus notas, sin tocar el hosting a mano.
--
-- Antes, actualizar la aplicación obligaba a copiar el APK por FTP a una ruta
-- fija del servidor y nadie sabía qué traía cada versión.

-- ── Tabla de versiones ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apk_version (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version             TEXT        NOT NULL,   -- lo que ve la gente: 1.1
  version_code        INTEGER,                -- el de build.gradle, para cotejar
  notas               TEXT        NOT NULL,   -- qué trae esta versión
  archivo_url         TEXT        NOT NULL,
  archivo_nombre      TEXT,
  archivo_bytes       BIGINT,
  -- Solo una versión está vigente a la vez. Las anteriores se conservan como
  -- historial: si una resulta defectuosa, se vuelve a publicar la previa en
  -- lugar de perder el rastro de lo que se repartió.
  vigente             BOOLEAN     NOT NULL DEFAULT TRUE,
  publicada_por       UUID,
  publicada_por_email TEXT,
  created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS apk_version_version_key ON apk_version (version);
CREATE INDEX IF NOT EXISTS apk_version_vigente_idx ON apk_version (vigente, created_date DESC);

ALTER TABLE apk_version ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a propósito: la tarjeta de descarga se muestra en la pantalla
-- de inicio de sesión, donde todavía no hay sesión. Lo que se expone es el
-- número de versión y sus notas, que es lo que cualquier aplicación publica.
DROP POLICY IF EXISTS apk_version_lectura ON apk_version;
CREATE POLICY apk_version_lectura ON apk_version
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS apk_version_escribe_superadmin ON apk_version;
CREATE POLICY apk_version_escribe_superadmin ON apk_version
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- ── Almacén del archivo ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('apk', 'apk', TRUE, 104857600)   -- 100 MB de margen; el APK ronda los 7
ON CONFLICT (id) DO UPDATE
  SET public = TRUE, file_size_limit = GREATEST(storage.buckets.file_size_limit, 104857600);

-- Descarga pública: el enlace se abre desde el navegador del teléfono, sin
-- sesión y a veces desde otra red.
DROP POLICY IF EXISTS apk_descarga_publica ON storage.objects;
CREATE POLICY apk_descarga_publica ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'apk');

-- Subir, reemplazar y borrar, solo superadmin.
DROP POLICY IF EXISTS apk_sube_superadmin ON storage.objects;
CREATE POLICY apk_sube_superadmin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'apk' AND get_my_role() = 'superadmin');

DROP POLICY IF EXISTS apk_actualiza_superadmin ON storage.objects;
CREATE POLICY apk_actualiza_superadmin ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'apk' AND get_my_role() = 'superadmin')
  WITH CHECK (bucket_id = 'apk' AND get_my_role() = 'superadmin');

DROP POLICY IF EXISTS apk_borra_superadmin ON storage.objects;
CREATE POLICY apk_borra_superadmin ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'apk' AND get_my_role() = 'superadmin');

-- ── Al publicar una versión, las demás dejan de estar vigentes ───────────────
-- Se hace en la base y no en el cliente para que no queden dos vigentes si dos
-- pestañas publican a la vez.
CREATE OR REPLACE FUNCTION fn_apk_una_sola_vigente()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.vigente THEN
    UPDATE apk_version SET vigente = FALSE
    WHERE id <> NEW.id AND vigente;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apk_una_sola_vigente ON apk_version;
CREATE TRIGGER trg_apk_una_sola_vigente
  AFTER INSERT OR UPDATE OF vigente ON apk_version
  FOR EACH ROW EXECUTE FUNCTION fn_apk_una_sola_vigente();
