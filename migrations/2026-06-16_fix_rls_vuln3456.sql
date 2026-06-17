-- ================================================================
--  CORRECCIÓN VULNERABILIDADES 3-6 — WebCombustible
--  Fecha: 2026-06-16
--  Ejecutar en: Supabase → SQL Editor
--  IDEMPOTENTE: sí
-- ================================================================


-- ================================================================
--  VULN 3 (ALTA) — audit_log: falsificación de entradas
--
--  Problema: "Service role write access" declara TO authenticated
--  pero permite insertar user_id arbitrario (atribuir acciones a otro).
--
--  Fix: WITH CHECK (user_id = auth.uid())
--    logAudit() ya usa supabase.auth.getUser() → user_id correcto.
--    No rompe el flujo existente. UPDATE y DELETE quedan bloqueados
--    implícitamente (RLS activo + sin política = denegado).
-- ================================================================

DROP POLICY IF EXISTS "Service role write access" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_own"      ON audit_log;

CREATE POLICY "audit_log_insert_own" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Sin política para UPDATE/DELETE → denegados por defecto (RLS activo)


-- ================================================================
--  VULN 4 (ALTA) — venta_trabajador: UPDATE sin restricciones
--
--  Problema: venta_update tiene USING sin WITH CHECK (= WITH CHECK true).
--  Cualquier cajero puede: monto = 0, revertir estado, borrar movimiento_id.
--
--  Fix: trigger BEFORE UPDATE con tres reglas:
--    1. registrado_por   → siempre inmutable
--    2. movimiento_id    → inmutable una vez establecido (≠ NULL)
--    3. campos financieros → inmutables fuera de estado PENDIENTE
--    4. grafo de transiciones de estado válidas
-- ================================================================

CREATE OR REPLACE FUNCTION validate_venta_update()
RETURNS TRIGGER AS $$
BEGIN

  -- 1. registrado_por: siempre inmutable
  IF NEW.registrado_por IS DISTINCT FROM OLD.registrado_por THEN
    RAISE EXCEPTION 'Campo registrado_por es inmutable';
  END IF;

  -- 2. movimiento_id: inmutable una vez establecido
  IF OLD.movimiento_id IS NOT NULL
     AND NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id THEN
    RAISE EXCEPTION 'Campo movimiento_id no puede modificarse una vez establecido';
  END IF;

  -- 3. Campos financieros: inmutables cuando ya no está en PENDIENTE
  IF OLD.estado NOT IN ('PENDIENTE') THEN
    IF NEW.litros           IS DISTINCT FROM OLD.litros           OR
       NEW.precio_por_litro IS DISTINCT FROM OLD.precio_por_litro OR
       NEW.monto            IS DISTINCT FROM OLD.monto            OR
       NEW.combustible_id   IS DISTINCT FROM OLD.combustible_id   OR
       NEW.tanque_origen_id IS DISTINCT FROM OLD.tanque_origen_id OR
       NEW.beneficiario_id  IS DISTINCT FROM OLD.beneficiario_id  THEN
      RAISE EXCEPTION 'Campos financieros inmutables en estado "%"', OLD.estado;
    END IF;
  END IF;

  -- 4. Transiciones de estado: grafo con nombres nuevos Y legacy
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN

    -- Estados terminales: nada puede cambiar
    IF OLD.estado IN ('CANCELADO', 'ANULADO', 'PAGADO_FINALIZADO', 'PAGADO') THEN
      RAISE EXCEPTION 'La venta en estado "%" no puede modificarse', OLD.estado;
    END IF;

    -- Desde PENDIENTE → ENTREGADO | RETIRADO | CANCELADO | ANULADO
    IF OLD.estado = 'PENDIENTE'
       AND NEW.estado NOT IN ('ENTREGADO', 'RETIRADO', 'CANCELADO', 'ANULADO') THEN
      RAISE EXCEPTION 'Transición inválida: PENDIENTE → %', NEW.estado;
    END IF;

    -- Desde ENTREGADO | RETIRADO → PAGADO_FINALIZADO | PAGADO | CANCELADO | ANULADO
    IF OLD.estado IN ('ENTREGADO', 'RETIRADO')
       AND NEW.estado NOT IN ('PAGADO_FINALIZADO', 'PAGADO', 'CANCELADO', 'ANULADO') THEN
      RAISE EXCEPTION 'Transición inválida: % → %', OLD.estado, NEW.estado;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_validate_venta_update ON venta_trabajador;
CREATE TRIGGER trg_validate_venta_update
  BEFORE UPDATE ON venta_trabajador
  FOR EACH ROW EXECUTE FUNCTION validate_venta_update();


-- ================================================================
--  VULN 5 (ALTA) — precio_despacho_tipo: sin RLS
--
--  Problema: la tabla existe sin ENABLE ROW LEVEL SECURITY.
--  Cualquier autenticado puede insertar precio = 999.99 para hoy
--  y la próxima bonificación lo usará automáticamente.
--
--  Fix: RLS + políticas. Sólo superadmin y economico pueden escribir
--  (son los únicos que gestionan la pestaña Precios en Finanzas).
-- ================================================================

ALTER TABLE precio_despacho_tipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precio_despacho_select_all" ON precio_despacho_tipo;
DROP POLICY IF EXISTS "precio_despacho_insert_eco" ON precio_despacho_tipo;
DROP POLICY IF EXISTS "precio_despacho_update_eco" ON precio_despacho_tipo;
DROP POLICY IF EXISTS "precio_despacho_delete_eco" ON precio_despacho_tipo;

CREATE POLICY "precio_despacho_select_all" ON precio_despacho_tipo
  FOR SELECT TO authenticated USING (true);

-- economico gestiona precios desde Finanzas → Precios de despacho
CREATE POLICY "precio_despacho_insert_eco" ON precio_despacho_tipo
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));

CREATE POLICY "precio_despacho_update_eco" ON precio_despacho_tipo
  FOR UPDATE TO authenticated
  USING     (get_my_role() IN ('superadmin', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));

CREATE POLICY "precio_despacho_delete_eco" ON precio_despacho_tipo
  FOR DELETE TO authenticated
  USING (get_my_role() = 'superadmin');


-- ================================================================
--  VULN 6 (MEDIA) — movimiento cajero: sin restricción de tipo
--
--  Problema: cajero puede INSERT cualquier tipo (COMPRA, AJUSTE, DEPOSITO…)
--  y cualquier litros sin validación de stock en BD.
--
--  Fix en dos partes:
--    A) Restricción de tipo: cajero solo puede insertar tipo='DESPACHO'
--    B) Trigger de stock: todo DESPACHO con origen definido debe tener
--       stock suficiente (impide sobregiro del tanque por API directa)
-- ================================================================

-- A: Restringir tipo para cajero (reemplaza la política del vuln anterior)
DROP POLICY IF EXISTS "movimiento_insert_ops" ON movimiento;

CREATE POLICY "movimiento_insert_ops" ON movimiento
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('superadmin', 'operador')
    OR (get_my_role() = 'cajero' AND tipo = 'DESPACHO')
  );

-- B: Trigger de stock para DESPACHO
--    Fórmula: stock = litros_iniciales
--                   + Σ(entradas: COMPRA + DEPOSITO + DESPACHO recibidos)
--                   - Σ(salidas:  DESPACHO enviados desde este origen)
--    Cubre tanto tanques (entradas vía COMPRA/DEPOSITO)
--    como distribuidores intermedios (entradas vía DESPACHO recibido).
CREATE OR REPLACE FUNCTION validate_despacho_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_ini   NUMERIC := 0;
  v_stock NUMERIC := 0;
BEGIN
  -- Solo aplica a DESPACHO con origen conocido
  IF NEW.tipo != 'DESPACHO' OR NEW.consumidor_origen_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Litros iniciales del tanque / consumidor origen
  SELECT COALESCE(litros_iniciales, 0)
  INTO   v_ini
  FROM   consumidor
  WHERE  id = NEW.consumidor_origen_id;

  -- Stock acumulado histórico del origen
  SELECT
    v_ini
    + COALESCE(SUM(
        CASE
          -- Entradas directas (compra o depósito al origen)
          WHEN tipo IN ('COMPRA', 'DEPOSITO') AND consumidor_id = NEW.consumidor_origen_id
            THEN litros
          -- Entradas por DESPACHO recibido (distribuidores no-tanque)
          WHEN tipo = 'DESPACHO' AND consumidor_id = NEW.consumidor_origen_id
            THEN litros
          -- Salidas por DESPACHO enviados desde el origen
          WHEN tipo = 'DESPACHO' AND consumidor_origen_id = NEW.consumidor_origen_id
            THEN -litros
          ELSE 0
        END
      ), 0)
  INTO v_stock
  FROM movimiento;

  IF v_stock < COALESCE(NEW.litros, 0) THEN
    RAISE EXCEPTION
      'Stock insuficiente en origen: disponible %.1f L, solicitado %.1f L',
      v_stock, COALESCE(NEW.litros, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_despacho_stock ON movimiento;
CREATE TRIGGER trg_validate_despacho_stock
  BEFORE INSERT ON movimiento
  FOR EACH ROW EXECUTE FUNCTION validate_despacho_stock();


-- ================================================================
--  VERIFICACIÓN
-- ================================================================
--
-- -- Políticas de las tablas nuevas:
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('audit_log', 'venta_trabajador', 'precio_despacho_tipo')
-- ORDER BY tablename, cmd;
--
-- -- Triggers activos:
-- SELECT trigger_name, event_manipulation, event_object_table, action_timing
-- FROM information_schema.triggers
-- WHERE trigger_name IN ('trg_validate_venta_update', 'trg_validate_despacho_stock')
-- ORDER BY event_object_table;
