-- Post-corte · Cierra el acceso directo a la base de datos.
--
-- Ejecutar SOLO cuando:
--   1. la pasarela está en producción y el frontend nuevo desplegado,
--   2. las APK antiguas han sido actualizadas (siguen hablando con Supabase),
--   3. migrations/2026-11-03_identidad_externa.sql está aplicada.
--
-- Desde este momento NADIE excepto la pasarela (service_role) puede leer ni
-- escribir en las tablas: ni con la anon key (pública, va dentro de cada APK y
-- bundle), ni con un JWT de Supabase Auth. RLS queda ACTIVO y SIN políticas, que
-- es «denegar todo» para anon y authenticated; la service_role lo ignora.
--
-- Qué NO se toca: la descarga pública de los buckets (apk, movimiento-adjuntos).
-- Un bucket público se sirve por /object/public/ sin pasar por RLS.
--
-- Vuelta atrás: restaurar las políticas con MIGRACION_GLOBAL.sql y volver a
-- conceder los GRANT (ver el final). Por eso la limpieza definitiva (borrar
-- user_roles, get_my_role…) está en una sección aparte, comentada.
--
-- Idempotente.

BEGIN;

-- 1. RLS activo en todas las tablas de public (denegar por defecto) ----------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 2. Fuera TODAS las políticas de public y las de los buckets propios --------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  -- Solo las políticas que mencionan nuestros buckets: storage.objects es
  -- compartido y puede tener otras ajenas a esta aplicación.
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(apk|movimiento-adjuntos)'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- 3. Sin privilegios para los roles de la API pública ------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- La pasarela, los procesos internos y las Edge Functions usan service_role.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

COMMIT;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- a) Ninguna política en public (esperado: 0 filas):
--      SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
-- b) Ninguna tabla sin RLS (esperado: 0 filas):
--      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
-- c) anon/authenticated sin privilegios (esperado: 0 filas):
--      SELECT table_name, grantee FROM information_schema.role_table_grants
--      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
-- d) Prueba desde fuera, con la anon key (debe devolver [] o 401/permission denied):
--      curl -s "$SUPABASE_URL/rest/v1/movimiento?select=id&limit=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

-- ── Limpieza definitiva (semanas después, cuando ya no haya vuelta atrás) ───
-- Descomentar solo si el sistema lleva estable el tiempo que decidáis.
--
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.get_or_create_user_role(text, text);
--   DROP TABLE    IF EXISTS public.user_roles;      -- ya no manda: los roles viven en el IS
--   DROP FUNCTION IF EXISTS public.get_my_role();   -- app_can() ya no lo usa tras esto: ver nota
-- COMMIT;
-- Nota: app_can() (migrations/2026-11-03) llama a get_my_role() en su rama de
-- compatibilidad. Antes de borrarlo, reescribir app_can() para que solo use las
-- cabeceras de la pasarela.
--
-- Vuelta atrás de este script:
--   1. Re-ejecutar MIGRACION_GLOBAL.sql (recrea las políticas), y
--   2. GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
--      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
