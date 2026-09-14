-- Adjuntos de movimientos: el almacén y sus permisos, que hasta ahora no
-- estaban en ningún archivo del repositorio.
--
-- El bucket se había creado a mano en el panel, así que no se podía reconstruir
-- el entorno desde cero ni se sabía qué permisos tenía. Subir un adjunto al
-- editar un movimiento fallaba sin decir por qué.
--
-- Las columnas venían de 2026-06-12_add_adjunto_to_movimiento.sql pero nunca
-- llegaron a MIGRACION_GLOBAL.sql: una base reconstruida desde el maestro se
-- quedaba sin ellas, y entonces el guardado falla con un 400 de PostgREST.
ALTER TABLE movimiento ADD COLUMN IF NOT EXISTS adjunto_url    TEXT;
ALTER TABLE movimiento ADD COLUMN IF NOT EXISTS adjunto_nombre TEXT;

-- Público porque el cliente guarda la dirección con getPublicUrl y así están
-- guardadas las de los adjuntos que ya existen: cerrarlo ahora dejaría sin
-- abrir todo lo subido hasta hoy. Las direcciones llevan un UUID, así que no se
-- adivinan, pero quien tenga el enlace puede abrirlo. Para cerrarlo de verdad
-- habría que pasar a enlaces firmados y migrar lo antiguo.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('movimiento-adjuntos', 'movimiento-adjuntos', TRUE, 10485760)  -- 10 MB
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = GREATEST(COALESCE(storage.buckets.file_size_limit, 0), 10485760);

DROP POLICY IF EXISTS adjuntos_lectura ON storage.objects;
CREATE POLICY adjuntos_lectura ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'movimiento-adjuntos');

-- Sube quien puede registrar o corregir movimientos. El auditor y el cajero no
-- tocan movimientos, así que tampoco sus adjuntos.
DROP POLICY IF EXISTS adjuntos_sube ON storage.objects;
CREATE POLICY adjuntos_sube ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'movimiento-adjuntos'
    AND get_my_role() IN ('superadmin', 'operador', 'economico')
  );

DROP POLICY IF EXISTS adjuntos_actualiza ON storage.objects;
CREATE POLICY adjuntos_actualiza ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'movimiento-adjuntos'
    AND get_my_role() IN ('superadmin', 'operador', 'economico')
  )
  WITH CHECK (
    bucket_id = 'movimiento-adjuntos'
    AND get_my_role() IN ('superadmin', 'operador', 'economico')
  );

DROP POLICY IF EXISTS adjuntos_borra ON storage.objects;
CREATE POLICY adjuntos_borra ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'movimiento-adjuntos'
    AND get_my_role() IN ('superadmin', 'operador', 'economico')
  );
