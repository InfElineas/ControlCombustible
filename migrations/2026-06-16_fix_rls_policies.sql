-- ================================================================
--  CORRECCIÓN DE VULNERABILIDADES RLS — WebCombustible
--  Fecha: 2026-06-16
--  Ejecutar en: Supabase → SQL Editor
--
--  VULNERABILIDADES CORREGIDAS:
--    [CRÍTICA] user_roles  — cualquier usuario podía escalar a superadmin
--    [ALTA]    movimiento  — cualquier usuario podía fabricar/borrar registros
--    [MEDIA]   tarjeta, consumidor, conductor, asignacion_ruta
--              — cualquier usuario autenticado podía escribir/borrar
--
--  IDEMPOTENTE: sí — se puede ejecutar múltiples veces sin error.
-- ================================================================


-- ================================================================
--  PASO 0 — Función auxiliar get_my_role()
--  SECURITY DEFINER: corre con privilegios del owner, saltando RLS.
--  Esto evita dependencia circular cuando las políticas de user_roles
--  necesitan consultar user_roles para verificar el rol del usuario.
-- ================================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ================================================================
--  BLOQUE 1 — user_roles
--  Vulnerabilidad CRÍTICA: escalada de privilegios
--
--  Cualquier usuario ejecutaba:
--    supabase.from('user_roles').update({ role: 'superadmin' }).eq('user_id', myId)
--  y obtenía acceso total al sistema.
--
--  Nuevo modelo:
--    SELECT  → cada usuario ve SOLO su propia fila
--              (superadmin ve todas, para AdminPanel)
--    INSERT  → bootstrap: primer auto-registro solo con role='auditor'
--              superadmin puede insertar cualquier fila
--    UPDATE  → solo superadmin (propio o ajeno)
--    DELETE  → solo superadmin
-- ================================================================

-- 1.0 Eliminar TODAS las políticas existentes en user_roles
--     (nombres legacy descubiertos por pg_policies tras primera ejecución)
DROP POLICY IF EXISTS "Authenticated read access"  ON user_roles;
DROP POLICY IF EXISTS "Authenticated write access" ON user_roles;
DROP POLICY IF EXISTS "authenticated_all"          ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert"          ON user_roles;
DROP POLICY IF EXISTS "user_roles_select"          ON user_roles;
DROP POLICY IF EXISTS "user_roles_update"          ON user_roles;
-- Limpiar si ya se ejecutó esta migración antes
DROP POLICY IF EXISTS "user_roles_select_own"           ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_superadmin"    ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert_bootstrap"     ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert_superadmin"    ON user_roles;
DROP POLICY IF EXISTS "user_roles_update_superadmin"    ON user_roles;
DROP POLICY IF EXISTS "user_roles_delete_superadmin"    ON user_roles;

-- 1.1 SELECT — usuario ve solo su propia fila
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 1.2 SELECT — superadmin ve todas las filas (necesario para AdminPanel)
--     get_my_role() es SECURITY DEFINER → evita dependencia circular de RLS
CREATE POLICY "user_roles_select_superadmin" ON user_roles
  FOR SELECT TO authenticated
  USING (get_my_role() = 'superadmin');

-- 1.3 INSERT — bootstrap inicial
--     Un usuario recién registrado, SIN fila aún, puede insertarse UNA SOLA VEZ
--     pero únicamente con role='auditor'. Impide auto-asignar superadmin/operador.
--
--     Nota sobre NOT EXISTS: la subquery usa RLS (filtra por user_id = auth.uid()),
--     por lo que solo ve la fila del propio usuario. Si no existe → puede registrarse.
CREATE POLICY "user_roles_insert_bootstrap" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'auditor'
    AND NOT EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- 1.4 INSERT — superadmin puede crear filas con cualquier rol para cualquier usuario
CREATE POLICY "user_roles_insert_superadmin" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'superadmin');

-- 1.5 UPDATE — solo superadmin puede cambiar roles (propios o ajenos)
CREATE POLICY "user_roles_update_superadmin" ON user_roles
  FOR UPDATE TO authenticated
  USING     (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- 1.6 DELETE — solo superadmin
CREATE POLICY "user_roles_delete_superadmin" ON user_roles
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ================================================================
--  BLOQUE 2 — movimiento
--  Vulnerabilidad ALTA: fabricación/borrado de registros de combustible
--
--  Cualquier usuario (auditor, cajero) ejecutaba:
--    supabase.from('movimiento').insert({...}) / .delete()
--  y podía alterar el historial de combustible.
--
--  Nuevo modelo:
--    SELECT  → todos los roles autenticados
--    INSERT  → superadmin, operador
--    UPDATE  → superadmin, operador
--    DELETE  → solo superadmin
--
--  Cajero: puede INSERT/UPDATE para crear el DESPACHO automático al marcar
--  una bonificación como ENTREGADO. No puede DELETE (solo superadmin).
-- ================================================================

-- 2.0 Eliminar todas las políticas existentes en movimiento
DROP POLICY IF EXISTS "Authenticated full access" ON movimiento;
DROP POLICY IF EXISTS "authenticated_all"         ON movimiento;
-- Limpiar si ya se ejecutó antes
DROP POLICY IF EXISTS "movimiento_select_all"        ON movimiento;
DROP POLICY IF EXISTS "movimiento_insert_ops"        ON movimiento;
DROP POLICY IF EXISTS "movimiento_update_ops"        ON movimiento;
DROP POLICY IF EXISTS "movimiento_delete_superadmin" ON movimiento;

-- 2.1 SELECT — todos los autenticados leen
CREATE POLICY "movimiento_select_all" ON movimiento
  FOR SELECT TO authenticated
  USING (true);

-- 2.2 INSERT — superadmin, operador y cajero
--     cajero necesita insertar el DESPACHO automático al entregar bonificaciones
CREATE POLICY "movimiento_insert_ops" ON movimiento
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador', 'cajero'));

-- 2.3 UPDATE — superadmin, operador y cajero
CREATE POLICY "movimiento_update_ops" ON movimiento
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'operador', 'cajero'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador', 'cajero'));

-- 2.4 DELETE — solo superadmin
CREATE POLICY "movimiento_delete_superadmin" ON movimiento
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ================================================================
--  BLOQUE 3 — Tablas adicionales con patrón inseguro
--  Todas usaban: FOR ALL TO authenticated USING (true) WITH CHECK (true)
--
--  Patrón estándar aplicado:
--    SELECT          → todos los autenticados
--    INSERT / UPDATE → superadmin, operador
--    DELETE          → solo superadmin
-- ================================================================


-- ── tarjeta ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access" ON tarjeta;
DROP POLICY IF EXISTS "authenticated_all"         ON tarjeta;
DROP POLICY IF EXISTS "tarjeta_select_all"        ON tarjeta;
DROP POLICY IF EXISTS "tarjeta_insert_ops"        ON tarjeta;
DROP POLICY IF EXISTS "tarjeta_update_ops"        ON tarjeta;
DROP POLICY IF EXISTS "tarjeta_delete_superadmin" ON tarjeta;

CREATE POLICY "tarjeta_select_all" ON tarjeta
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tarjeta_insert_ops" ON tarjeta
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "tarjeta_update_ops" ON tarjeta
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "tarjeta_delete_superadmin" ON tarjeta
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ── consumidor ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access"   ON consumidor;
DROP POLICY IF EXISTS "authenticated_all"            ON consumidor;
DROP POLICY IF EXISTS "consumidor_select_all"        ON consumidor;
DROP POLICY IF EXISTS "consumidor_insert_ops"        ON consumidor;
DROP POLICY IF EXISTS "consumidor_update_ops"        ON consumidor;
DROP POLICY IF EXISTS "consumidor_delete_superadmin" ON consumidor;

CREATE POLICY "consumidor_select_all" ON consumidor
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "consumidor_insert_ops" ON consumidor
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "consumidor_update_ops" ON consumidor
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "consumidor_delete_superadmin" ON consumidor
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ── conductor ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access"   ON conductor;
DROP POLICY IF EXISTS "authenticated_all"           ON conductor;
DROP POLICY IF EXISTS "conductor_select_all"        ON conductor;
DROP POLICY IF EXISTS "conductor_insert_ops"        ON conductor;
DROP POLICY IF EXISTS "conductor_update_ops"        ON conductor;
DROP POLICY IF EXISTS "conductor_delete_superadmin" ON conductor;

CREATE POLICY "conductor_select_all" ON conductor
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "conductor_insert_ops" ON conductor
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "conductor_update_ops" ON conductor
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "conductor_delete_superadmin" ON conductor
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ── asignacion_ruta ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access"         ON asignacion_ruta;
DROP POLICY IF EXISTS "asig_write"                        ON asignacion_ruta;
DROP POLICY IF EXISTS "asig_select"                       ON asignacion_ruta;
DROP POLICY IF EXISTS "asignacion_ruta_select_all"        ON asignacion_ruta;
DROP POLICY IF EXISTS "asignacion_ruta_insert_ops"        ON asignacion_ruta;
DROP POLICY IF EXISTS "asignacion_ruta_update_ops"        ON asignacion_ruta;
DROP POLICY IF EXISTS "asignacion_ruta_delete_superadmin" ON asignacion_ruta;

CREATE POLICY "asignacion_ruta_select_all" ON asignacion_ruta
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "asignacion_ruta_insert_ops" ON asignacion_ruta
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "asignacion_ruta_update_ops" ON asignacion_ruta
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

CREATE POLICY "asignacion_ruta_delete_superadmin" ON asignacion_ruta
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ================================================================
--  VERIFICACIÓN — consultar las políticas aplicadas
--  (ejecutar por separado si se desea confirmar)
-- ================================================================
--
-- SELECT tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN (
--   'user_roles', 'movimiento', 'tarjeta',
--   'consumidor', 'conductor', 'asignacion_ruta'
-- )
-- ORDER BY tablename, cmd;
