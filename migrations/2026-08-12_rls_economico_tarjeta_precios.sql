-- Otorga al rol economico control total sobre tarjetas y precios de despacho.
-- precio_combustible ya tiene acceso abierto a todos los autenticados.

-- Tarjetas
DROP POLICY IF EXISTS "tarjeta_insert_ops"        ON tarjeta;
DROP POLICY IF EXISTS "tarjeta_update_ops"        ON tarjeta;
DROP POLICY IF EXISTS "tarjeta_delete_superadmin" ON tarjeta;

CREATE POLICY "tarjeta_insert_ops" ON tarjeta
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador', 'economico'));

CREATE POLICY "tarjeta_update_ops" ON tarjeta
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'operador', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador', 'economico'));

CREATE POLICY "tarjeta_delete_ops" ON tarjeta
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'));

-- Precios de despacho: permitir delete a economico
DROP POLICY IF EXISTS "precio_despacho_delete_eco" ON precio_despacho_tipo;

CREATE POLICY "precio_despacho_delete_eco" ON precio_despacho_tipo
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'));
