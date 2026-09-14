-- Un tanque en negativo bloqueaba editar cualquier movimiento suyo.
--
-- Los dos disparadores de stock comprueban el saldo del tanque en cada UPDATE,
-- sin mirar si el cambio tiene algo que ver con el saldo. Si el tanque ya
-- arrastraba un descuadre —por ejemplo los −4.99 L de Cupet ACAPULCO— entonces
-- corregir la referencia, la fecha o adjuntar una factura fallaba con el mismo
-- error de stock. En la pantalla parecia que no subia el adjunto, porque el
-- archivo si llegaba al almacen y lo que se rechazaba era guardar la fila.
--
-- Peor aun: dejaba el descuadre sin arreglo posible desde la aplicacion, que es
-- justo cuando hace falta editar esos movimientos.
--
-- Ahora, si el cambio no toca nada que entre en el calculo del saldo, el
-- movimiento se guarda. En cuanto se tocan litros, tipo, tanques, combustible o
-- tarjeta, la comprobacion vuelve a aplicarse entera.

CREATE OR REPLACE FUNCTION validate_despacho_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_disp   numeric;
  v_nombre text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.litros               IS NOT DISTINCT FROM OLD.litros
     AND NEW.tipo                 IS NOT DISTINCT FROM OLD.tipo
     AND NEW.consumidor_id        IS NOT DISTINCT FROM OLD.consumidor_id
     AND NEW.consumidor_origen_id IS NOT DISTINCT FROM OLD.consumidor_origen_id
     AND NEW.combustible_id       IS NOT DISTINCT FROM OLD.combustible_id
     AND NEW.tarjeta_id           IS NOT DISTINCT FROM OLD.tarjeta_id
  THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo <> 'DESPACHO' OR NEW.consumidor_origen_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_disp := fn_stock_disponible(
    NEW.consumidor_origen_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END
  );

  IF v_disp < COALESCE(NEW.litros, 0) THEN
    SELECT nombre INTO v_nombre FROM consumidor WHERE id = NEW.consumidor_origen_id;
    RAISE EXCEPTION 'Stock insuficiente en "%": disponible % L, solicitado % L. Registra una COMPRA o un DEPOSITO para reponer antes de despachar.',
      COALESCE(v_nombre, 'origen'), round(v_disp, 1), round(COALESCE(NEW.litros, 0), 1);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION validate_movimiento_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_ids  uuid[] := ARRAY[]::uuid[];
  r      RECORD;
  v_disp numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.litros               IS NOT DISTINCT FROM OLD.litros
     AND NEW.tipo                 IS NOT DISTINCT FROM OLD.tipo
     AND NEW.consumidor_id        IS NOT DISTINCT FROM OLD.consumidor_id
     AND NEW.consumidor_origen_id IS NOT DISTINCT FROM OLD.consumidor_origen_id
     AND NEW.combustible_id       IS NOT DISTINCT FROM OLD.combustible_id
     AND NEW.tarjeta_id           IS NOT DISTINCT FROM OLD.tarjeta_id
  THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_ids := v_ids || ARRAY[NEW.consumidor_id, NEW.consumidor_origen_id];
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_ids := v_ids || ARRAY[OLD.consumidor_id, OLD.consumidor_origen_id];
  END IF;

  FOR r IN
    SELECT c.id, c.nombre
    FROM consumidor c
    WHERE c.id = ANY(v_ids)
      AND c.categoria IN ('deposito','surtidor')
  LOOP
    v_disp := fn_stock_disponible(r.id);
    IF v_disp < 0 THEN
      RAISE EXCEPTION 'La operación dejaría "%" con % L. Falta registrar una entrada o sobra una salida: corrígelo antes de guardar este cambio.',
        r.nombre, round(v_disp, 2);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
