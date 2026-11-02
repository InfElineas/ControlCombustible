-- Fase 0 · ¿Se han aprovechado las 4 vulnerabilidades de RLS? (solo lectura)
-- Ejecutar en Supabase → SQL Editor. Devuelve un JSON con 4 secciones.
--
--   A_escalada_roles       Política user_roles_insert_own (el rol por defecto de
--                          la columna es 'operador', así que bastaba insertar la
--                          propia fila sin indicar rol).
--                          SOSPECHOSO = tiene rol por encima de 'auditor' y NINGÚN
--                          ROLE_CHANGE en audit_log hecho por un superadmin.
--                          Ojo: cuentas muy antiguas o promovidas a mano por SQL
--                          también salen; hay que revisarlas una a una.
--   B_auditoria_falsificada  Política audit_insert (WITH CHECK true): filas cuyo
--                          user_id no existe o no coincide con su user_email.
--   C_escrituras_indebidas   Política authenticated_all: escrituras en las 5
--                          tablas por usuarios cuyo rol NO tiene permiso.
--   D_adjuntos_anonimos      Política "allow upload": archivos en el bucket sin
--                          dueño (subidos sin sesión) y no referenciados por
--                          ningún movimiento.

WITH
permitido(entidad, roles) AS (
  VALUES ('tipoconsumidor',   ARRAY['superadmin']),
         ('tipocombustible',  ARRAY['superadmin','operador']),
         ('preciocombustible',ARRAY['superadmin','economico']),
         ('vehiculo',         ARRAY['superadmin','operador']),
         ('configalerta',     ARRAY['superadmin','operador'])
),
-- A ---------------------------------------------------------------------------
cambios_rol AS (
  SELECT a.entity_id AS user_id_txt,
         count(*)                         AS cambios,
         count(*) FILTER (WHERE sa.id IS NOT NULL) AS cambios_por_superadmin,
         max(a.created_date)              AS ultimo_cambio
  FROM audit_log a
  LEFT JOIN user_roles sa ON sa.user_id = a.user_id AND sa.role = 'superadmin'
  WHERE a.action = 'ROLE_CHANGE' AND a.entity_type = 'UserRole'
  GROUP BY a.entity_id
),
escalada AS (
  SELECT ur.email, ur.role, ur.status,
         ur.created_date                              AS fila_creada,
         au.created_at                                AS cuenta_creada,
         round(extract(epoch FROM (ur.created_date - au.created_at)))::int AS seg_entre_cuenta_y_fila,
         COALESCE(c.cambios, 0)                       AS cambios_de_rol_registrados,
         COALESCE(c.cambios_por_superadmin, 0)        AS cambios_hechos_por_superadmin,
         (ur.role <> 'auditor' AND COALESCE(c.cambios_por_superadmin, 0) = 0) AS sospechoso
  FROM user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN cambios_rol c ON c.user_id_txt = ur.user_id::text
),
-- B ---------------------------------------------------------------------------
falsa AS (
  SELECT a.id, a.created_date, a.action, a.entity_type, a.entity_label,
         a.user_id, a.user_email AS email_declarado, u.email AS email_real,
         CASE WHEN u.id IS NULL THEN 'user_id inexistente'
              ELSE 'user_email no coincide con user_id' END AS motivo
  FROM audit_log a
  LEFT JOIN auth.users u ON u.id = a.user_id
  WHERE a.user_id IS NOT NULL
    AND (u.id IS NULL OR lower(COALESCE(a.user_email, '')) <> lower(COALESCE(u.email, '')))
),
-- C ---------------------------------------------------------------------------
indebida AS (
  SELECT a.created_date, a.user_email, ur.role AS rol_actual, ur.status,
         a.action, a.entity_type, a.entity_label
  FROM audit_log a
  JOIN permitido p ON p.entidad = lower(replace(a.entity_type, '_', ''))
  LEFT JOIN user_roles ur ON ur.user_id = a.user_id
  WHERE a.action IN ('CREATE', 'UPDATE', 'DELETE')
    AND (ur.role IS NULL OR ur.role <> ALL (p.roles) OR ur.status <> 'active')
),
-- D ---------------------------------------------------------------------------
huerfanos AS (
  SELECT o.name, o.created_at, o.owner, o.owner_id,
         (o.metadata ->> 'size')::bigint     AS bytes,
         o.metadata ->> 'mimetype'           AS tipo_mime,
         EXISTS (SELECT 1 FROM movimiento m WHERE m.adjunto_url LIKE '%' || o.name) AS referenciado
  FROM storage.objects o
  WHERE o.bucket_id = 'movimiento-adjuntos'
)
SELECT jsonb_pretty(jsonb_build_object(
  'generado', now(),
  'A_escalada_roles', jsonb_build_object(
      'sospechosos', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.fila_creada), '[]'::jsonb) FROM escalada e WHERE e.sospechoso),
      'todos',       (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.fila_creada), '[]'::jsonb) FROM escalada e)),
  'B_auditoria_falsificada', jsonb_build_object(
      'total', (SELECT count(*) FROM falsa),
      'filas', (SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_date DESC), '[]'::jsonb) FROM (SELECT * FROM falsa ORDER BY created_date DESC LIMIT 100) f),
      'sin_user_id_total', (SELECT count(*) FROM audit_log WHERE user_id IS NULL)),
  'C_escrituras_indebidas', jsonb_build_object(
      'total', (SELECT count(*) FROM indebida),
      'resumen', (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                  FROM (SELECT user_email, rol_actual, status, entity_type, action, count(*) AS veces,
                               min(created_date) AS primera, max(created_date) AS ultima
                        FROM indebida GROUP BY 1,2,3,4,5 ORDER BY veces DESC LIMIT 100) r)),
  'D_adjuntos_anonimos', jsonb_build_object(
      'total_en_bucket', (SELECT count(*) FROM huerfanos),
      'sin_dueno',       (SELECT count(*) FROM huerfanos WHERE owner IS NULL AND COALESCE(owner_id, '') = ''),
      'sin_dueno_y_sin_referencia', (SELECT count(*) FROM huerfanos WHERE owner IS NULL AND COALESCE(owner_id, '') = '' AND NOT referenciado),
      'muestra', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC), '[]'::jsonb)
                  FROM (SELECT name, created_at, bytes, tipo_mime FROM huerfanos
                        WHERE owner IS NULL AND COALESCE(owner_id, '') = '' AND NOT referenciado
                        ORDER BY created_at DESC LIMIT 50) h))
)) AS verificacion;
