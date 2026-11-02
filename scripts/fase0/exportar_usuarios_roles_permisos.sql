-- Fase 0 · Exporta usuarios, roles y permisos en un solo JSON.
-- Solo lectura. Ejecutar en Supabase → SQL Editor y copiar la celda "export".
--
--   usuarios : todo lo de auth.users + su fila de user_roles (rol, estado).
--              sin_fila_user_roles = true -> existe en Supabase Auth pero nunca
--              entró en la app (no tiene rol).
--   roles    : cuántos usuarios hay por rol y estado.
--   permisos : una fila por política RLS (public y storage). `roles_en_expresion`
--              son los roles de la app que nombra la condición; `abierta` = true
--              si la condición es `true` (cualquier usuario de ese rol de BD).
--              Las condiciones por contenido (p. ej. tipo = 'DESPACHO' en
--              movimiento) van completas en `condicion_using` / `condicion_check`.

WITH
usuarios AS (
  SELECT au.id                                   AS auth_user_id,
         au.email,
         ur.full_name,
         ur.role,
         ur.status,
         (ur.user_id IS NULL)                    AS sin_fila_user_roles,
         COALESCE(au.raw_app_meta_data ->> 'provider', '') AS proveedor,
         au.raw_app_meta_data -> 'providers'     AS proveedores,
         au.email_confirmed_at,
         au.last_sign_in_at,
         au.banned_until,
         au.created_at
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
),
roles AS (
  SELECT role, status, count(*) AS usuarios
  FROM public.user_roles
  GROUP BY role, status
),
permisos AS (
  SELECT p.schemaname                            AS esquema,
         p.tablename                             AS tabla,
         p.policyname                            AS politica,
         p.cmd                                   AS operacion,
         p.roles                                 AS rol_bd,
         (SELECT array_agg(r ORDER BY r)
            FROM unnest(ARRAY['superadmin','operador','cajero','economico','auditor']) AS r
           WHERE (COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, ''))
                 LIKE '%''' || r || '''%')       AS roles_en_expresion,
         (COALESCE(p.qual, p.with_check) = 'true') AS abierta,
         p.qual                                  AS condicion_using,
         p.with_check                            AS condicion_check
  FROM pg_policies p
  WHERE p.schemaname IN ('public', 'storage')
)
SELECT jsonb_pretty(jsonb_build_object(
  'generado',  now(),
  'usuarios',  (SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.email), '[]'::jsonb) FROM usuarios u),
  'roles',     (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.role, r.status), '[]'::jsonb) FROM roles r),
  'permisos',  (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.esquema, x.tabla, x.operacion, x.politica), '[]'::jsonb) FROM permisos x)
)) AS export;
