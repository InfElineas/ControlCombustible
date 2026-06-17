-- Permitir transición directa PENDIENTE → PAGADO_FINALIZADO | PAGADO
-- Caso de uso: entrega y cobro simultáneo (el cliente paga al retirar).
-- La app crea el DESPACHO de movimiento automáticamente en esta transición.

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
