-- Propuesta 5: extender la validacion de stock a edicion y borrado.
--
-- Hasta ahora trg_validate_despacho_stock era BEFORE INSERT unicamente, con
-- dos consecuencias:
--   1. Editar un DESPACHO ya registrado y subirle los litros no pasaba ningun
--      control.
--   2. Borrar una COMPRA o un DEPOSITO antiguo descuadraba el inventario hacia
--      atras sin aviso.
-- Ademas calculaba el stock sumando todos los combustibles del origen, asi que
-- en un tanque multicombustible permitia despachar diesel contra existencias
-- de gasolina.
--
-- Esta migracion introduce:
--   fn_stock_disponible          formula unica, la misma de v_stock_tanques
--   trg_validate_despacho_stock  BEFORE INSERT/UPDATE, mensaje para el operador
--   trg_movimiento_balance       AFTER INSERT/UPDATE/DELETE, red de seguridad
--
-- ANTES DE APLICAR conviene medir cuanto se edita y se borra hoy:
--
--   SELECT action, COUNT(*) AS veces
--   FROM audit_log
--   WHERE entity_type = 'Movimiento'
--     AND action IN ('UPDATE','DELETE')
--     AND created_date >= NOW() - INTERVAL '30 days'
--   GROUP BY action;
--
-- Si salen numeros altos, parte de esas operaciones empezaran a fallar cuando
-- dejen un deposito en negativo, y conviene avisar al equipo antes.


-- ─────────────────────────────────────────────────────────────
--  Formula unica de stock
-- ─────────────────────────────────────────────────────────────
-- Replica exactamente las entradas y salidas de v_stock_tanques, incluida la
-- regla de surtidores (las COMPRA pagadas con su tarjeta vinculada son salidas)
-- y el filtro permisivo por combustible: si el consumidor o el movimiento no
-- tienen combustible asignado, el movimiento cuenta igualmente.
--
-- p_excluir permite ignorar un movimiento concreto, necesario al validar un
-- UPDATE: la fila vieja sigue en la tabla mientras el trigger BEFORE se ejecuta.

CREATE OR REPLACE FUNCTION fn_stock_disponible(
  p_consumidor uuid,
  p_excluir    uuid DEFAULT NULL
) RETURNS numeric AS $$
DECLARE
  v_ini      numeric := 0;
  v_cat      text;
  v_comb     uuid;
  v_tanque   jsonb;
  v_entradas numeric := 0;
  v_salidas  numeric := 0;
BEGIN
  SELECT COALESCE(c.litros_iniciales,0), c.categoria, c.combustible_id, c.datos_tanque
    INTO v_ini, v_cat, v_comb, v_tanque
  FROM consumidor c WHERE c.id = p_consumidor;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(m.litros),0) INTO v_entradas
  FROM movimiento m
  WHERE m.consumidor_id = p_consumidor
    AND (p_excluir IS NULL OR m.id <> p_excluir)
    AND (m.tipo IN ('COMPRA','DEPOSITO')
      OR (m.tipo = 'DESPACHO' AND (m.referencia IS NULL OR m.referencia NOT ILIKE 'Bonificación combustible:%')))
    AND (v_comb IS NULL OR m.combustible_id IS NULL OR m.combustible_id = v_comb);

  SELECT COALESCE(SUM(x.litros),0) INTO v_salidas FROM (
    SELECT m.litros FROM movimiento m
    WHERE m.tipo = 'DESPACHO' AND m.consumidor_origen_id = p_consumidor
      AND (p_excluir IS NULL OR m.id <> p_excluir)
      AND (v_comb IS NULL OR m.combustible_id IS NULL OR m.combustible_id = v_comb)
    UNION ALL
    SELECT m.litros FROM movimiento m
    WHERE v_cat = 'surtidor' AND m.tipo = 'COMPRA'
      AND (p_excluir IS NULL OR m.id <> p_excluir)
      AND (
        (jsonb_typeof(v_tanque->'tarjetas_vinculadas_ids') = 'array'
          AND m.tarjeta_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(v_tanque->'tarjetas_vinculadas_ids'))))
        OR ((v_tanque->'tarjetas_vinculadas_ids') IS NULL
          AND m.tarjeta_id::text = (v_tanque->>'tarjeta_vinculada_id'))
      )
      AND (v_comb IS NULL OR m.combustible_id IS NULL OR m.combustible_id = v_comb)
  ) x;

  RETURN v_ini + v_entradas - v_salidas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION fn_stock_disponible(uuid, uuid) IS
  'Litros disponibles de un consumidor con la misma formula que v_stock_tanques. p_excluir ignora un movimiento, para validar ediciones.';


-- ─────────────────────────────────────────────────────────────
--  1. Aviso al operador: el origen del DESPACHO debe tener stock
-- ─────────────────────────────────────────────────────────────
-- Cubre ahora tambien UPDATE. Da el mensaje concreto con disponible y
-- solicitado, que es el que ve quien esta registrando el movimiento.

CREATE OR REPLACE FUNCTION validate_despacho_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_disp   numeric;
  v_nombre text;
BEGIN
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

DROP TRIGGER IF EXISTS trg_validate_despacho_stock ON movimiento;
CREATE TRIGGER trg_validate_despacho_stock
  BEFORE INSERT OR UPDATE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION validate_despacho_stock();


-- ─────────────────────────────────────────────────────────────
--  2. Red de seguridad: ningun deposito puede quedar en negativo
-- ─────────────────────────────────────────────────────────────
-- Se ejecuta DESPUES de aplicar la fila, asi que comprueba el estado final
-- real sin tener que simular el efecto de la operacion. Cubre los dos huecos
-- que quedaban abiertos: editar un movimiento a la baja y borrar una entrada.
--
-- Solo mira depositos y surtidores: los vehiculos y equipos son consumidores
-- finales y su balance negativo no significa nada.

CREATE OR REPLACE FUNCTION validate_movimiento_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_ids  uuid[] := ARRAY[]::uuid[];
  r      RECORD;
  v_disp numeric;
BEGIN
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

DROP TRIGGER IF EXISTS trg_movimiento_balance ON movimiento;
CREATE TRIGGER trg_movimiento_balance
  AFTER INSERT OR UPDATE OR DELETE ON movimiento
  FOR EACH ROW EXECUTE FUNCTION validate_movimiento_balance();
