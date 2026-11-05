-- Roles que Supabase da hechos y aquí hay que crear a mano.
--
-- Todo MIGRACION_GLOBAL.sql los nombra: cada política RLS dice «TO authenticated»
-- o «TO anon». Sin estos roles el esquema no se aplica, falla en la primera
-- política.
--
-- authenticator es el único con contraseña: es el que usa PostgREST para
-- conectarse. No puede hacer nada por sí mismo; cambia a uno de los otros tres
-- según el token de cada petición (de ahí NOINHERIT).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS: es el rol con el que entra la pasarela, que ya decidió la
    -- autorización antes de llegar aquí. Es también lo que hace Supabase.
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format(
      'CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L',
      coalesce(current_setting('custom.authenticator_password', true), 'cambiame')
    );
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Lo que se cree de aquí en adelante (MIGRACION_GLOBAL.sql corre después) nace
-- con estos permisos, para no tener que repetirlos tabla a tabla.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Las políticas RLS siguen siendo las que deciden qué ve cada uno: estos GRANT
-- solo abren la puerta de la tabla, no saltan RLS (salvo service_role, que sí
-- por BYPASSRLS).
