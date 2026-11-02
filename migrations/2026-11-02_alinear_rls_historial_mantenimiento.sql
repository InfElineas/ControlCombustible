-- Alinea historial_mantenimiento con el resto de tablas de operación.
--
-- Antes:
--   SELECT  sin "TO": lo podía leer cualquiera con la anon key, sin iniciar sesión.
--   INSERT / DELETE: cualquier usuario autenticado (auth.uid() IS NOT NULL),
--           incluidos auditor y económico, aunque la pantalla de Transporte
--           solo deja escribir a superadmin y operador (canWrite).
--
-- Ahora, igual que vehiculo, conductor, ruta, etc.:
--   SELECT  cualquier usuario autenticado.
--   INSERT / UPDATE / DELETE  superadmin y operador.
--
-- La barrera estaba solo en la interfaz; aquí pasa a estar en la base de datos.
-- Idempotente: se puede ejecutar más de una vez.

BEGIN;

ALTER TABLE historial_mantenimiento ENABLE ROW LEVEL SECURITY;

-- Políticas anteriores (nombres de la migración 2026-07-14)
DROP POLICY IF EXISTS "hm_select_all"  ON historial_mantenimiento;
DROP POLICY IF EXISTS "hm_insert_auth" ON historial_mantenimiento;
DROP POLICY IF EXISTS "hm_delete_auth" ON historial_mantenimiento;

-- Por si se ejecutó antes
DROP POLICY IF EXISTS "historial_mantenimiento_select_all" ON historial_mantenimiento;
DROP POLICY IF EXISTS "historial_mantenimiento_write_ops"  ON historial_mantenimiento;

CREATE POLICY "historial_mantenimiento_select_all" ON historial_mantenimiento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "historial_mantenimiento_write_ops" ON historial_mantenimiento
  FOR ALL TO authenticated
  USING      (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- La anon key ya no debe tocar esta tabla.
REVOKE ALL ON historial_mantenimiento FROM anon;

COMMIT;

-- Comprobación (debe mostrar 2 políticas, ambas con roles = {authenticated}):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'historial_mantenimiento' ORDER BY policyname;
