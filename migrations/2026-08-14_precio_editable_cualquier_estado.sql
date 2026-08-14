-- Permite corregir el precio de una bonificacion en cualquier estado.
--
-- Hasta ahora el precio solo era modificable en PENDIENTE y, desde una
-- migracion anterior, tambien al pasar a PAGADO_FINALIZADO. Una factura en
-- ENTREGADO quedaba con el precio congelado, y es justo cuando se detectan los
-- errores de tarifa: el cajero no podia corregirla sin cancelar y rehacer.
--
-- Que cambia: precio_por_litro, precio_venta_unitario y monto dejan de ser
-- inmutables. Lo que define la operacion —litros, combustible, tanque de origen
-- y beneficiario— sigue congelado fuera de PENDIENTE, porque cambiarlo despues
-- de entregar descuadraria el stock ya despachado.
--
-- El control de quien puede hacerlo vive en la aplicacion (superadmin y
-- cajero); aqui solo se levanta la prohibicion. Cada correccion se registra en
-- audit_log con autor, fecha y valores anterior y nuevo.

CREATE OR REPLACE FUNCTION validate_venta_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registrado_por IS DISTINCT FROM OLD.registrado_por THEN
    RAISE EXCEPTION 'Campo registrado_por es inmutable';
  END IF;

  IF OLD.movimiento_id IS NOT NULL AND NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id THEN
    RAISE EXCEPTION 'Campo movimiento_id no puede modificarse una vez establecido';
  END IF;

  -- Fuera de PENDIENTE se congela lo que define la operacion. El precio y el
  -- monto quedan fuera de esta lista: son corregibles en cualquier estado.
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
