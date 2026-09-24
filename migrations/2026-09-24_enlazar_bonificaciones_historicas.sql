-- Enlaza los despachos de bonificacion con la ficha de su destino.
--
-- Hasta ahora se guardaban con consumidor_id en blanco y solo el nombre del
-- destino copiado como texto. Sin ficha no hay tipo, y sin tipo no hay concepto
-- de consumo: esos litros salian como «Sin concepto» en el panel de inicio y no
-- habia forma de clasificarlos desde la aplicacion.
--
-- NO SE MUEVE NINGUNA CANTIDAD. Solo se rellena una referencia que estaba
-- vacia. El stock no cambia porque fn_stock_disponible ya deja fuera de las
-- entradas los despachos cuya referencia empieza por «Bonificación
-- combustible:», enlazados o no.
--
-- Se enlaza unicamente cuando el nombre guardado corresponde a un consumidor y
-- a uno solo. Si hay dos fichas con el mismo nombre, la fila se deja como esta:
-- mejor un pendiente visible que una atribucion inventada.

-- ── 1. Que se va a tocar ──────────────────────────────────────────────────
-- Ejecuta esto antes si quieres ver el reparto sin cambiar nada:
--
--   SELECT m.consumidor_nombre,
--          count(*) AS despachos,
--          sum(m.litros) AS litros,
--          (SELECT count(*) FROM consumidor c WHERE c.nombre = m.consumidor_nombre) AS fichas_con_ese_nombre
--   FROM movimiento m
--   WHERE m.tipo = 'DESPACHO'
--     AND m.referencia ILIKE 'Bonificación combustible:%'
--     AND m.consumidor_id IS NULL
--   GROUP BY m.consumidor_nombre
--   ORDER BY litros DESC;

-- ── 2. El enlace ──────────────────────────────────────────────────────────
-- Los disparadores de stock se apagan durante la operacion. Revisan el saldo
-- en cada UPDATE, y aqui se tocan cientos de movimientos antiguos sobre tanques
-- que hoy pueden estar descuadrados: cualquiera de ellos abortaria la migracion
-- entera por un descuadre que este cambio ni provoca ni empeora.
ALTER TABLE movimiento DISABLE TRIGGER trg_validate_despacho_stock;
ALTER TABLE movimiento DISABLE TRIGGER trg_movimiento_balance;

DO $$
DECLARE
  v_filas   integer;
  v_sueltos integer;
BEGIN
  UPDATE movimiento m
  SET consumidor_id = (
        SELECT c.id FROM consumidor c
        WHERE c.nombre = m.consumidor_nombre
      )
  WHERE m.tipo = 'DESPACHO'
    AND m.referencia ILIKE 'Bonificación combustible:%'
    AND m.consumidor_id IS NULL
    AND m.consumidor_nombre IS NOT NULL
    AND (SELECT count(*) FROM consumidor c WHERE c.nombre = m.consumidor_nombre) = 1;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  SELECT count(*) INTO v_sueltos
  FROM movimiento m
  WHERE m.tipo = 'DESPACHO'
    AND m.referencia ILIKE 'Bonificación combustible:%'
    AND m.consumidor_id IS NULL;

  RAISE NOTICE 'Despachos de bonificación enlazados: %', v_filas;
  IF v_sueltos > 0 THEN
    RAISE NOTICE 'Quedan % sin enlazar: su nombre no corresponde a ninguna ficha, o hay varias con ese mismo nombre.', v_sueltos;
    RAISE NOTICE 'La consulta del punto 1 te dice cuáles son.';
  END IF;
END $$;

ALTER TABLE movimiento ENABLE TRIGGER trg_validate_despacho_stock;
ALTER TABLE movimiento ENABLE TRIGGER trg_movimiento_balance;

-- ── 3. Despues ────────────────────────────────────────────────────────────
-- Para que dejen de salir como «Sin concepto», la ficha enlazada necesita un
-- tipo de consumidor, y ese tipo un concepto:
--
--   Catálogos → Consumidores      → asignar el tipo a la ficha de logística
--   Catálogos → Tipos de consumidor → asignar el concepto a ese tipo
--
-- Si no existe el concepto, se crea antes en Finanzas → Conceptos.
