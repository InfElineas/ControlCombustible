-- ================================================================
--  FIX: DELETE de movimiento y cancelación de bonificaciones
--  Fecha: 2026-06-25
--  EJECUTAR EN: Supabase → SQL Editor
--  IDEMPOTENTE: sí
-- ================================================================

-- ----------------------------------------------------------------
--  1. RLS movimiento DELETE: permitir operador además de superadmin
--
--  La política anterior solo permitía superadmin, pero el frontend
--  expone el botón de eliminar a operadores (canDelete = superadmin | operador).
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "movimiento_delete_superadmin" ON movimiento;
DROP POLICY IF EXISTS "movimiento_delete_ops" ON movimiento;

CREATE POLICY "movimiento_delete_ops" ON movimiento
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador'));


-- ----------------------------------------------------------------
--  2. validate_venta_update: permitir limpiar movimiento_id al cancelar
--
--  Antes: movimiento_id era completamente inmutable una vez establecido.
--  Problema: al cancelar una bonificación ENTREGADA hay que borrar el
--  DESPACHO asociado. El flujo JS hace:
--    a) UPDATE venta_trabajador SET estado='CANCELADO', movimiento_id=NULL
--    b) DELETE FROM movimiento WHERE id = <movimiento_id>
--  El trigger bloqueaba (a) porque cambiaba movimiento_id.
--  Fix: permitir limpiar movimiento_id cuando el nuevo estado es CANCELADO o ANULADO.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_venta_update()
RETURNS TRIGGER AS $$
BEGIN

  -- 1. registrado_por: siempre inmutable
  IF NEW.registrado_por IS DISTINCT FROM OLD.registrado_por THEN
    RAISE EXCEPTION 'Campo registrado_por es inmutable';
  END IF;

  -- 2. movimiento_id: no se puede cambiar de un UUID a otro UUID diferente.
  --    Poner NULL siempre está permitido (ON DELETE SET NULL del FK, o cancelación).
  IF OLD.movimiento_id IS NOT NULL
     AND NEW.movimiento_id IS NOT NULL
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

  -- 4. Transiciones de estado válidas
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN

    -- Estados terminales: nada puede cambiar
    IF OLD.estado IN ('CANCELADO', 'ANULADO', 'PAGADO_FINALIZADO', 'PAGADO') THEN
      RAISE EXCEPTION 'La venta en estado "%" no puede modificarse', OLD.estado;
    END IF;

    -- Desde PENDIENTE → ENTREGADO | RETIRADO | PAGADO_FINALIZADO | PAGADO | CANCELADO | ANULADO
    IF OLD.estado = 'PENDIENTE'
       AND NEW.estado NOT IN ('ENTREGADO', 'RETIRADO', 'PAGADO_FINALIZADO', 'PAGADO', 'CANCELADO', 'ANULADO') THEN
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
