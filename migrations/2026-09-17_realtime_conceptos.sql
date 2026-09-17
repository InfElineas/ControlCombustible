-- concepto_precio en la propagacion en tiempo real.
--
-- Se quedo fuera de 2026-09-14_realtime.sql porque entonces ningun sitio
-- mostraba conceptos. Ahora el desglose del gasto del panel de inicio y el
-- selector de Tipos de consumidor los leen, asi que crear o renombrar un
-- concepto tiene que llegar solo a quien tenga la pagina abierta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'concepto_precio'
  ) THEN
    RAISE NOTICE 'Se omite concepto_precio: no existe en este esquema';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'concepto_precio'
  ) THEN
    RAISE NOTICE 'Ya estaba publicada: concepto_precio';
    RETURN;
  END IF;

  ALTER PUBLICATION supabase_realtime ADD TABLE public.concepto_precio;
  RAISE NOTICE 'Publicada: concepto_precio';
END $$;
