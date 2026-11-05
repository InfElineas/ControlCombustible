-- Esquema `auth` mínimo, para que el esquema de la aplicación se aplique igual.
--
-- La identidad vive en elineas-auth desde noviembre, pero MIGRACION_GLOBAL.sql
-- sigue lleno de referencias a lo que daba Supabase: políticas que llaman a
-- auth.uid(), user_roles con clave foránea a auth.users, y get_my_role(). Son
-- muchas y tocarlas todas en la misma ventana del traslado es pedir un fallo.
--
-- Esto es el camino 1 del plan (docs/migracion-bd/PLAN.md, punto 4): se crea lo
-- justo para que el esquema entre sin cambios, y la limpieza de verdad se hace
-- después, con el sistema ya estable.
--
-- No es un apaño silencioso: auth.uid() devuelve NULL a propósito, porque ya no
-- hay sesión de Supabase de la que sacar un id. Toda política que dependiera de
-- auth.uid() deja de conceder nada — y está bien, porque la autorización la
-- decide la pasarela antes de llegar aquí. Lo que no puede pasar es que el
-- esquema no se aplique.

CREATE SCHEMA IF NOT EXISTS auth;

-- Los ids de usuario son ahora los de elineas-auth. Esta tabla existe para que
-- las claves foráneas de autoría tengan a dónde apuntar mientras no se quiten
-- (migrations/2026-11-03_identidad_externa.sql quita tres de las cuatro).
CREATE TABLE IF NOT EXISTS auth.users (
  id    UUID PRIMARY KEY,
  email TEXT
);

-- NULL, no un error: las políticas que la llaman deben evaluar a falso, no
-- reventar la consulta.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

-- Algunas políticas de Supabase usan también estas dos.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$ SELECT current_user::text $$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$ SELECT NULL::text $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email()
  TO anon, authenticated, service_role;
