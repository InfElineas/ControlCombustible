-- Cierra cuatro agujeros de RLS detectados en producción (export del 2026-11-02).
-- Las políticas se SUMAN con OR: una política abierta anula a todas las
-- restrictivas de la misma tabla. Todas las políticas que se borran aquí tienen
-- ya una equivalente restrictiva que cubre el uso legítimo.
--
--  1. authenticated_all (ALL, true) en config_alerta, precio_combustible,
--     tipo_combustible, tipo_consumidor y vehiculo: cualquier usuario
--     autenticado (auditor, deshabilitado, pendiente) podía escribir.
--     Quedan las políticas *_write_* por rol.
--  2. user_roles_insert_own (auth.uid() = user_id, sin condición de rol): un
--     usuario nuevo podía insertar su propia fila y, como la columna `role` tenía
--     DEFAULT 'operador', quedaba activo con ese rol (o con el que pidiera).
--     Quedan el alta por RPC (siempre 'auditor'/'pending') y la de superadmin.
--  3. audit_insert (WITH CHECK true): permitía falsificar entradas de auditoría.
--     Queda audit_log_insert_own (user_id = auth.uid()).
--  4. allow upload (Storage, anon + authenticated): permitía subir archivos al
--     bucket movimiento-adjuntos SIN sesión. Queda adjuntos_sube
--     (superadmin, operador, económico).
--
-- Además: elimina políticas duplicadas y deja user_roles_select_own solo para
-- usuarios autenticados. No cambia ningún permiso legítimo.
-- Idempotente.

BEGIN;

-- ── 1. authenticated_all, en cualquier tabla donde exista ───────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND policyname = 'authenticated_all'
  LOOP
    EXECUTE format('DROP POLICY authenticated_all ON %I.%I', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 2. user_roles ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_roles_insert_own"  ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_own"  ON user_roles;
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Mínimo privilegio: una fila sin rol explícito es 'auditor' (solo lectura),
-- no 'operador'. Las altas legítimas ya indican el rol.
ALTER TABLE user_roles ALTER COLUMN role SET DEFAULT 'auditor';

-- ── 3. audit_log ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_insert" ON audit_log;
-- audit_select (solo superadmin) queda anulada por "Authenticated read access"
-- (lectura abierta a autenticados, comportamiento actual). Se elimina por claridad.
DROP POLICY IF EXISTS "audit_select" ON audit_log;

-- ── 4. Storage ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow upload" ON storage.objects;
DROP POLICY IF EXISTS "allow select" ON storage.objects;  -- duplicada de adjuntos_lectura

-- ── 5. Duplicadas (misma regla dos veces) ───────────────────────────────────
DROP POLICY IF EXISTS "ruta_write"                  ON ruta;
DROP POLICY IF EXISTS "ruta_select"                 ON ruta;
DROP POLICY IF EXISTS "precio_despacho_tipo_select" ON precio_despacho_tipo;
DROP POLICY IF EXISTS "precio_despacho_tipo_insert" ON precio_despacho_tipo;
DROP POLICY IF EXISTS "precio_despacho_tipo_delete" ON precio_despacho_tipo;

COMMIT;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- 1) No debe quedar ninguna política abierta de escritura:
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
--      AND COALESCE(qual, with_check) = 'true';
--    Resultado esperado: 0 filas.
-- 2) Storage: INSERT en movimiento-adjuntos solo con adjuntos_sube / apk_sube_*:
--    SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'storage' AND cmd = 'INSERT';
-- 3) user_roles ya no admite alta propia:
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_roles' ORDER BY cmd;
