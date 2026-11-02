-- Fase 0 · Extracción del estado REAL de autorización en Supabase.
-- Solo lectura: ninguna sentencia modifica nada.
-- Ejecutar en Supabase → SQL Editor, de una en una, y guardar cada resultado.

-- 1. Políticas RLS vigentes (esquemas public y storage).
--    Es la fuente de verdad de la matriz rol × tabla × operación.
SELECT schemaname, tablename, policyname, cmd, roles,
       qual       AS using_expr,
       with_check AS check_expr
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, cmd, policyname;

-- 2. Funciones que dependen de la identidad de Supabase.
--    Cada una de estas se rompe (o se salta una regla) al usar service_role.
SELECT n.nspname AS esquema, p.proname AS funcion,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND ( pg_get_functiondef(p.oid) ILIKE '%auth.uid()%'
     OR pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
     OR pg_get_functiondef(p.oid) ILIKE '%get_my_role%'
     OR pg_get_functiondef(p.oid) ILIKE '%user_roles%' )
ORDER BY p.proname;

-- 3. Triggers del esquema public (para ver cuáles llaman a las funciones de 2).
SELECT event_object_table AS tabla, trigger_name, event_manipulation AS evento,
       action_timing AS momento, action_statement AS accion
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 4. Permisos (GRANT) de anon y authenticated sobre tablas y vistas.
--    Una tabla con GRANT a anon y RLS desactivado queda abierta al público.
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 5. Tablas de public SIN RLS activado (candidatas a estar abiertas hoy).
SELECT c.relname AS tabla, c.relkind AS tipo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY c.relname;

-- 6. Vistas y su modo de ejecución (security_invoker = respeta RLS del que consulta).
SELECT c.relname AS vista, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY c.relname;

-- 7. Columnas que guardan la identidad del usuario (afectan al tipo del `sub` del IS)
--    y claves foráneas hacia auth.users.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name IN ('user_id', 'created_by', 'registrado_por', 'updated_by', 'usuario_id')
       OR column_name ILIKE '%user%' OR column_name ILIKE '%usuario%')
ORDER BY table_name, column_name;

SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'auth.users'::regclass;

-- 8. Usuarios actuales para crearlos en elineas-auth (exportar a CSV).
--    Las contraseñas no se migran: cada usuario deberá restablecerla.
SELECT ur.email, ur.full_name, ur.role, ur.status,
       au.last_sign_in_at,
       COALESCE(au.raw_app_meta_data ->> 'provider', '') AS proveedor
FROM user_roles ur
LEFT JOIN auth.users au ON au.id = ur.user_id
ORDER BY ur.status, ur.role, ur.email;

-- 9. Cuántos usuarios hay por rol y estado (control rápido).
SELECT role, status, count(*) FROM user_roles GROUP BY role, status ORDER BY role, status;
