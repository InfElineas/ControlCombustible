-- Corrige el error 400 al cancelar una bonificacion ya entregada.
--
-- El trigger prohibia modificar movimiento_id una vez establecido, pensado para
-- que nadie reapunte una bonificacion a otro despacho. Pero cancelar una
-- factura entregada necesita exactamente eso: primero se desvincula el despacho
-- (movimiento_id = NULL) y despues se borra, devolviendo el combustible al
-- tanque. La prohibicion hacia fallar la cancelacion con "Campo movimiento_id
-- no puede modificarse una vez establecido".
--
-- Alcance del fallo: solo cancelar desde ENTREGADO. Desde PENDIENTE no hay
-- despacho que desvincular, y los estados terminales no admiten cambio.
--
-- Ahora se permite el unico caso legitimo —poner a NULL al cancelar o anular— y
-- se mantiene bloqueado reapuntar a otro movimiento.

CREATE OR REPLACE FUNCTION validate_venta_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registrado_por IS DISTINCT FROM OLD.registrado_por THEN
    RAISE EXCEPTION 'Campo registrado_por es inmutable';
  END IF;

  IF OLD.movimiento_id IS NOT NULL
     AND NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id
     AND NOT (NEW.movimiento_id IS NULL AND NEW.estado IN ('CANCELADO','ANULADO')) THEN
    RAISE EXCEPTION 'El despacho asociado solo puede desvincularse al cancelar la bonificación';
  END IF;

  -- Fuera de PENDIENTE se congela lo que define la operacion. El precio y el
  -- monto quedan fuera: son corregibles en cualquier estado.
  IF OLD.estado NOT IN ('PENDIENTE') THEN
    IF NEW.litros           IS DISTINCT FROM OLD.litros
    OR NEW.combustible_id   IS DISTINCT FROM OLD.combustible_id
    OR NEW.tanque_origen_id IS DISTINCT FROM OLD.tanque_origen_id
    OR NEW.beneficiario_id  IS DISTINCT FROM OLD.beneficiario_id THEN
      RAISE EXCEPTION 'En estado "%" solo puede corregirse el precio: litros, combustible, tanque y beneficiario son inmutables', OLD.estado;
    END IF;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF OLD.estado IN ('CANCELADO','ANULADO','PAGADO_FINALIZADO','PAGADO') THEN
      RAISE EXCEPTION 'La venta en estado "%" no puede cambiar de estado', OLD.estado;
    END IF;
    IF OLD.estado = 'PENDIENTE' AND NEW.estado NOT IN ('ENTREGADO','RETIRADO','PAGADO_FINALIZADO','PAGADO','CANCELADO','ANULADO') THEN
      RAISE EXCEPTION 'Transición inválida: PENDIENTE → %', NEW.estado;
    END IF;
    IF OLD.estado IN ('ENTREGADO','RETIRADO') AND NEW.estado NOT IN ('PAGADO_FINALIZADO','PAGADO','CANCELADO','ANULADO') THEN
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
