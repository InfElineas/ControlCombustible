-- Publica en tiempo real los cambios de las tablas de operación.
--
-- Sin esto, la suscripción del cliente se conecta y no recibe nada: Postgres
-- solo emite cambios de las tablas que están en la publicación, y falla en
-- silencio, que es lo que más cuesta diagnosticar.
--
-- Lo que viaja es el aviso de que una tabla cambió; el cliente vuelve a
-- consultar por los caminos de siempre, así que las políticas siguen decidiendo
-- quién ve qué.

DO $$
DECLARE
  t TEXT;
  tablas TEXT[] := ARRAY[
    'movimiento', 'venta_trabajador', 'anomalia_descartada',
    'consumidor', 'conductor', 'beneficiario', 'tarjeta',
    'tipo_combustible', 'tipo_consumidor', 'concepto_precio',
    'precio_combustible', 'precio_despacho_tipo',
    'asignacion_ruta', 'ruta', 'marcador', 'ruta_marcador',
    'user_roles', 'apk_version'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    -- Se salta lo que no exista en este entorno en vez de abortar la migración.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Se omite %: no existe en este esquema', t;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'Ya estaba publicada: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    RAISE NOTICE 'Publicada: %', t;
  END LOOP;
END $$;

-- Comprobación: debe listar las tablas de arriba.
-- SELECT tablename FROM pg_publication_tables
--  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' ORDER BY tablename;
