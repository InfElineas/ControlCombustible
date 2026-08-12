-- 2026-08-12 — RLS movimiento
-- 1) económico puede registrar DEPÓSITOS (el formulario ya se lo ofrecía, pero RLS lo bloqueaba)
-- 2) cajero puede borrar el DESPACHO que él mismo genera (cancelar bonificación / rollback)

DROP POLICY IF EXISTS "movimiento_insert_ops"        ON movimiento;
DROP POLICY IF EXISTS "movimiento_delete_superadmin" ON movimiento;

CREATE POLICY "movimiento_insert_ops" ON movimiento
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('superadmin', 'operador')
    OR (get_my_role() = 'cajero'    AND tipo = 'DESPACHO')
    OR (get_my_role() = 'economico' AND tipo = 'DEPOSITO')
  );

CREATE POLICY "movimiento_delete_superadmin" ON movimiento
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'superadmin'
    OR (get_my_role() = 'cajero' AND tipo = 'DESPACHO')
  );
