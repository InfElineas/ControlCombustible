-- Cierra las tablas que quedaban con "Authenticated full access": cualquier
-- usuario autenticado (incluidos auditor y cajero) podía hacer INSERT/UPDATE/
-- DELETE sobre ellas vía API directa, saltándose los controles del frontend.
--
-- Criterio: SELECT abierto a todo autenticado (la app es de consulta amplia);
-- la escritura sigue al rol que ya controla esa pantalla en el frontend.

-- ── tipo_consumidor — Catálogos › Tipos de consumidor (solo superadmin) ──
DROP POLICY IF EXISTS "Authenticated full access" ON tipo_consumidor;
DROP POLICY IF EXISTS "tipo_consumidor_select_all" ON tipo_consumidor;
DROP POLICY IF EXISTS "tipo_consumidor_write_admin" ON tipo_consumidor;

CREATE POLICY "tipo_consumidor_select_all" ON tipo_consumidor
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipo_consumidor_write_admin" ON tipo_consumidor
  FOR ALL TO authenticated
  USING (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- ── tipo_combustible — Catálogos › Combustibles + importación ──
DROP POLICY IF EXISTS "Authenticated full access" ON tipo_combustible;
DROP POLICY IF EXISTS "tipo_combustible_select_all" ON tipo_combustible;
DROP POLICY IF EXISTS "tipo_combustible_write_ops" ON tipo_combustible;

CREATE POLICY "tipo_combustible_select_all" ON tipo_combustible
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipo_combustible_write_ops" ON tipo_combustible
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- ── precio_combustible — Catálogos › Precios (superadmin/economico) ──
DROP POLICY IF EXISTS "Authenticated full access" ON precio_combustible;
DROP POLICY IF EXISTS "precio_combustible_select_all" ON precio_combustible;
DROP POLICY IF EXISTS "precio_combustible_write_eco" ON precio_combustible;

CREATE POLICY "precio_combustible_select_all" ON precio_combustible
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "precio_combustible_write_eco" ON precio_combustible
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));

-- ── vehiculo ──
DROP POLICY IF EXISTS "Authenticated full access" ON vehiculo;
DROP POLICY IF EXISTS "vehiculo_select_all" ON vehiculo;
DROP POLICY IF EXISTS "vehiculo_write_ops" ON vehiculo;

CREATE POLICY "vehiculo_select_all" ON vehiculo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehiculo_write_ops" ON vehiculo
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- ── config_alerta — Alertas (auditor entra en solo lectura) ──
DROP POLICY IF EXISTS "Authenticated full access" ON config_alerta;
DROP POLICY IF EXISTS "config_alerta_select_all" ON config_alerta;
DROP POLICY IF EXISTS "config_alerta_write_ops" ON config_alerta;

CREATE POLICY "config_alerta_select_all" ON config_alerta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_alerta_write_ops" ON config_alerta
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- ── ruta — Rutas (auditor entra en solo lectura) ──
DROP POLICY IF EXISTS "Authenticated full access" ON ruta;
DROP POLICY IF EXISTS "ruta_select_all" ON ruta;
DROP POLICY IF EXISTS "ruta_write_ops" ON ruta;

CREATE POLICY "ruta_select_all" ON ruta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ruta_write_ops" ON ruta
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- ── marcador ──
DROP POLICY IF EXISTS "Authenticated full access" ON marcador;
DROP POLICY IF EXISTS "marcador_select_all" ON marcador;
DROP POLICY IF EXISTS "marcador_write_ops" ON marcador;

CREATE POLICY "marcador_select_all" ON marcador
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "marcador_write_ops" ON marcador
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- ── ruta_marcador — paradas de ruta (saveWaypoints) ──
DROP POLICY IF EXISTS "Authenticated full access" ON ruta_marcador;
DROP POLICY IF EXISTS "ruta_marcador_select_all" ON ruta_marcador;
DROP POLICY IF EXISTS "ruta_marcador_write_ops" ON ruta_marcador;

CREATE POLICY "ruta_marcador_select_all" ON ruta_marcador
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ruta_marcador_write_ops" ON ruta_marcador
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));

-- ── reporte_chat_transporte — Transporte ──
DROP POLICY IF EXISTS "Authenticated full access" ON reporte_chat_transporte;
DROP POLICY IF EXISTS "reporte_chat_transporte_select_all" ON reporte_chat_transporte;
DROP POLICY IF EXISTS "reporte_chat_transporte_write_ops" ON reporte_chat_transporte;

CREATE POLICY "reporte_chat_transporte_select_all" ON reporte_chat_transporte
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "reporte_chat_transporte_write_ops" ON reporte_chat_transporte
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'))
  WITH CHECK (get_my_role() IN ('superadmin', 'operador'));
