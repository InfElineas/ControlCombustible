-- Corte · Remapea los ids de usuario de Supabase Auth a los de elineas-auth.
--
-- Por qué: el IS genera sus propios UUID. Las columnas de autoría ya guardadas
-- (quién registró o cobró una bonificación, quién hizo un mantenimiento, quién
-- firmó cada entrada de auditoría) apuntan a ids de Supabase Auth que dejarán de
-- existir. Sin este paso el historial queda con identificadores huérfanos.
--
-- Cuándo: en la ventana de corte, con la app congelada, DESPUÉS de crear los
-- usuarios en el IS y DESPUÉS de aplicar migrations/2026-11-03_identidad_externa.sql.
--
-- Pasos:
--   1. En la base de elineas-auth:  SELECT email, id FROM "user";   (exportar)
--   2. Pegar el resultado en el INSERT de abajo (paso A).
--   3. Ejecutar el paso B (vista previa). NO continuar si hay correos sin pareja
--      que tengan datos asociados.
--   4. Ejecutar el paso C (aplica) y revisar los conteos finales.
--
-- Idempotente: una segunda ejecución no cambia nada (los ids ya son los nuevos).
-- Guarda la equivalencia en public.identidad_equivalencia por si hay que auditar.

-- ── A. Equivalencias (correo -> id en el IS) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identidad_equivalencia (
  email       text PRIMARY KEY,
  sub_is      uuid NOT NULL,
  id_supabase uuid,
  creado      timestamptz NOT NULL DEFAULT now()
);

-- REEMPLAZAR por los datos reales del IS:
INSERT INTO public.identidad_equivalencia (email, sub_is)
VALUES
  ('persona1@gmail.com', '00000000-0000-0000-0000-000000000001')
  -- , ('persona2@gmail.com', '...')
ON CONFLICT (email) DO UPDATE SET sub_is = EXCLUDED.sub_is;

UPDATE public.identidad_equivalencia e
SET id_supabase = u.id
FROM auth.users u
WHERE lower(u.email) = lower(e.email) AND e.id_supabase IS NULL;

-- ── B. Vista previa (solo lectura) ──────────────────────────────────────────
-- Usuarios de Supabase sin pareja en el IS y cuántas filas dejarían huérfanas.
SELECT u.email,
       (SELECT count(*) FROM venta_trabajador v WHERE v.registrado_por = u.id OR v.cobrado_por = u.id) AS ventas,
       (SELECT count(*) FROM historial_mantenimiento h WHERE h.created_by = u.id)                      AS mantenimientos,
       (SELECT count(*) FROM audit_log a WHERE a.user_id = u.id)                                       AS auditoria
FROM auth.users u
LEFT JOIN public.identidad_equivalencia e ON e.id_supabase = u.id
WHERE e.id_supabase IS NULL
ORDER BY 1;

-- ── C. Aplicar ──────────────────────────────────────────────────────────────
BEGIN;

-- registrado_por es inmutable por trigger y venta_trabajador tiene otros triggers
-- de validación; se desactivan SOLO los de usuario, solo durante este UPDATE.
ALTER TABLE venta_trabajador DISABLE TRIGGER USER;

UPDATE venta_trabajador v
SET registrado_por = COALESCE((SELECT e.sub_is FROM identidad_equivalencia e WHERE e.id_supabase = v.registrado_por), v.registrado_por),
    cobrado_por    = COALESCE((SELECT e.sub_is FROM identidad_equivalencia e WHERE e.id_supabase = v.cobrado_por),    v.cobrado_por)
WHERE v.registrado_por IN (SELECT id_supabase FROM identidad_equivalencia)
   OR v.cobrado_por    IN (SELECT id_supabase FROM identidad_equivalencia);

ALTER TABLE venta_trabajador ENABLE TRIGGER USER;

UPDATE historial_mantenimiento h
SET created_by = e.sub_is
FROM identidad_equivalencia e
WHERE h.created_by = e.id_supabase;

UPDATE audit_log a
SET user_id = e.sub_is
FROM identidad_equivalencia e
WHERE a.user_id = e.id_supabase;

COMMIT;

-- ── D. Comprobación: no debe quedar ningún id antiguo con pareja ────────────
SELECT 'venta_trabajador' AS tabla, count(*) AS pendientes
FROM venta_trabajador v JOIN identidad_equivalencia e ON e.id_supabase IN (v.registrado_por, v.cobrado_por)
UNION ALL SELECT 'historial_mantenimiento', count(*)
FROM historial_mantenimiento h JOIN identidad_equivalencia e ON e.id_supabase = h.created_by
UNION ALL SELECT 'audit_log', count(*)
FROM audit_log a JOIN identidad_equivalencia e ON e.id_supabase = a.user_id;
-- Los tres deben ser 0.
