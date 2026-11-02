-- Prepara la base de datos para que la identidad la ponga elineas-auth.
--
-- Se puede aplicar ANTES del corte: mientras Supabase Auth siga activo, todo se
-- comporta exactamente igual que hoy. Después del corte (las peticiones llegan
-- por la pasarela con la service_role) deja de depender de auth.uid().
--
-- 1. app_header() / app_can(): permiso del usuario según la pasarela.
--    La pasarela envía `x-app-user` y `x-app-permissions` en cada petición a
--    PostgREST. PostgREST las expone en `request.headers`. SOLO se confían si la
--    petición llega con el rol de base de datos `service_role`: cualquiera con
--    la anon key o con un JWT de Supabase puede enviar esas cabeceras, y no deben
--    valer nada para él.
-- 2. validate_venta_update(): la separación de funciones de las bonificaciones
--    (economico no cancela, cajero no cobra) usaba get_my_role(), que con la
--    service_role devuelve NULL y dejaba pasar TODO sin error. Ahora pregunta por
--    el permiso.
-- 3. Quita las FK a auth.users en las columnas de autoría: los usuarios del IS no
--    existen en auth.users y las inserciones fallarían. Siguen siendo UUID
--    (el id de usuario del IS es UUID).
--
-- No toca user_roles, get_my_role() ni get_or_create_user_role(): el frontend
-- actual aún los usa y sirven de vuelta atrás. Se retiran en la limpieza posterior
-- al corte (ver docs/migracion-is/).

BEGIN;

-- ── 1. Identidad que envía la pasarela ──────────────────────────────────────
CREATE OR REPLACE FUNCTION app_header(p_nombre text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    CASE
      WHEN COALESCE(current_setting('request.headers', true), '') = '' THEN NULL
      ELSE (current_setting('request.headers', true)::json ->> lower(p_nombre))
    END,
    ''
  )
$$;

-- ¿Puede quien escribe realizar esta acción?
--   · Petición de la pasarela (service_role + x-app-user): consulta sus permisos.
--   · Cualquier otro caso: comportamiento anterior, por rol de user_roles. Es
--     también el de los procesos internos con service_role sin identidad (cron),
--     que no deben quedar bloqueados.
-- Debe ser SECURITY INVOKER: current_user ha de ser el rol que hizo la petición.
CREATE OR REPLACE FUNCTION app_can(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_user = 'service_role' AND app_header('x-app-user') IS NOT NULL THEN
      p_permiso = ANY (string_to_array(COALESCE(app_header('x-app-permissions'), ''), ','))
    ELSE
      CASE p_permiso
        WHEN 'bonificacion:cancelar' THEN get_my_role() IS DISTINCT FROM 'economico'
        WHEN 'bonificacion:cobrar'   THEN get_my_role() IS DISTINCT FROM 'cajero'
        ELSE false
      END
  END
$$;

-- ── 2. Trigger de bonificaciones ────────────────────────────────────────────
-- Igual que en migrations/2026-09-24_roles_estados_bonificacion.sql salvo el
-- bloque "Quien hace el cambio decide si puede hacerlo".
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
    IF NEW.estado IN ('CANCELADO','ANULADO') AND NOT app_can('bonificacion:cancelar') THEN
      RAISE EXCEPTION 'No tiene permiso para cancelar una bonificación';
    END IF;
    IF NEW.estado IN ('PAGADO_FINALIZADO','PAGADO') AND NOT app_can('bonificacion:cobrar') THEN
      RAISE EXCEPTION 'No tiene permiso para dar por pagada una bonificación';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_validate_venta_update ON venta_trabajador;
CREATE TRIGGER trg_validate_venta_update
  BEFORE UPDATE ON venta_trabajador
  FOR EACH ROW EXECUTE FUNCTION validate_venta_update();

-- ── 3. FK a auth.users en columnas de autoría ───────────────────────────────
-- No se conoce el nombre de la restricción en cada proyecto: se busca.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabla, c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND ( (c.conrelid = 'public.venta_trabajador'::regclass         AND a.attname IN ('registrado_por', 'cobrado_por'))
         OR (c.conrelid = 'public.historial_mantenimiento'::regclass  AND a.attname = 'created_by') )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
  END LOOP;
END $$;

COMMIT;

-- Comprobación:
--   SELECT conrelid::regclass, conname FROM pg_constraint
--   WHERE contype = 'f' AND confrelid = 'auth.users'::regclass;
--   -- Solo debe quedar user_roles.user_id.
