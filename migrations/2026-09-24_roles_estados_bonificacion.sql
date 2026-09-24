-- Separacion de funciones en los cambios de estado de una bonificacion.
--
-- El disparador ya decia que transiciones son legales, pero no quien puede
-- hacerlas: cualquier rol con permiso de escritura podia cancelar o dar por
-- cobrada una bonificacion. Esconder la opcion en la pantalla no es un permiso;
-- la barrera tiene que estar aqui, donde no se puede rodear llamando a la API.
--
--   economico  lleva las cuentas y cobra, pero no anula una factura.
--   cajero     entrega y cobra en caja, pero no da por cerrado el cobro.
--   superadmin puede las dos cosas, porque responde por ambas.
--
-- El resto del cuerpo queda igual que en MIGRACION_GLOBAL.sql; se reescribe
-- entero porque CREATE OR REPLACE no admite parches parciales.
CREATE OR REPLACE FUNCTION validate_venta_update()
RETURNS TRIGGER AS $$
DECLARE
  v_rol TEXT;
BEGIN
  IF NEW.registrado_por IS DISTINCT FROM OLD.registrado_por THEN
    RAISE EXCEPTION 'Campo registrado_por es inmutable';
  END IF;

  IF OLD.movimiento_id IS NOT NULL
     AND NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id
     AND NOT (NEW.movimiento_id IS NULL AND NEW.estado IN ('CANCELADO','ANULADO')) THEN
    RAISE EXCEPTION 'El despacho asociado solo puede desvincularse al cancelar la bonificación';
  END IF;

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

    -- Quien hace el cambio decide si puede hacerlo.
    v_rol := get_my_role();
    IF NEW.estado IN ('CANCELADO','ANULADO') AND v_rol = 'economico' THEN
      RAISE EXCEPTION 'El rol económico no puede cancelar una bonificación';
    END IF;
    IF NEW.estado IN ('PAGADO_FINALIZADO','PAGADO') AND v_rol = 'cajero' THEN
      RAISE EXCEPTION 'El rol cajero no puede dar por pagada una bonificación';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_validate_venta_update ON venta_trabajador;
CREATE TRIGGER trg_validate_venta_update
  BEFORE UPDATE ON venta_trabajador
  FOR EACH ROW EXECUTE FUNCTION validate_venta_update();
