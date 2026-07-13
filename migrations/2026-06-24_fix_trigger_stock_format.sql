-- Corrige el formato del mensaje de error en validate_despacho_stock.
-- PL/pgSQL RAISE usa % (sin especificador de tipo) como placeholder posicional.
-- El uso anterior de %.1f producía mensajes como "disponible 0.1f L" en lugar del valor real.

CREATE OR REPLACE FUNCTION validate_despacho_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_ini   NUMERIC := 0;
  v_stock NUMERIC := 0;
BEGIN
  IF NEW.tipo != 'DESPACHO' OR NEW.consumidor_origen_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(litros_iniciales, 0) INTO v_ini FROM consumidor WHERE id = NEW.consumidor_origen_id;
  SELECT v_ini + COALESCE(SUM(
    CASE
      WHEN tipo IN ('COMPRA','DEPOSITO') AND consumidor_id = NEW.consumidor_origen_id THEN litros
      WHEN tipo = 'DESPACHO' AND consumidor_id = NEW.consumidor_origen_id THEN litros
      WHEN tipo = 'DESPACHO' AND consumidor_origen_id = NEW.consumidor_origen_id THEN -litros
      ELSE 0
    END), 0)
  INTO v_stock FROM movimiento;
  IF v_stock < COALESCE(NEW.litros, 0) THEN
    RAISE EXCEPTION 'Stock insuficiente en origen: disponible % L, solicitado % L',
      ROUND(v_stock::numeric, 1), ROUND(COALESCE(NEW.litros, 0)::numeric, 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
