-- ============================================================
-- WebCombustible – Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ============================================================
-- TABLA DE ROLES DE USUARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  full_name    text,
  role         text NOT NULL DEFAULT 'auditor'
                    CHECK (role IN ('superadmin', 'operador', 'auditor')),
  created_date timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================
-- CATÁLOGOS BASE
-- ============================================================
CREATE TABLE IF NOT EXISTS tipo_consumidor (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  icono        text DEFAULT 'truck',
  activo       boolean DEFAULT true,
  created_date timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tipo_combustible (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  activa       boolean DEFAULT true,
  created_date timestamptz DEFAULT now()
);

-- ============================================================
-- TARJETAS
-- ============================================================
CREATE TABLE IF NOT EXISTS tarjeta (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarjeta   text NOT NULL,
  alias        text,
  moneda       text DEFAULT 'USD',
  saldo_inicial numeric DEFAULT 0,
  umbral_alerta numeric,
  activa       boolean DEFAULT true,
  created_date timestamptz DEFAULT now()
);

-- ============================================================
-- VEHÍCULOS Y CONDUCTORES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehiculo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapa          text NOT NULL,
  marca          text,
  modelo         text,
  ano            integer,
  combustible_id uuid REFERENCES tipo_combustible(id),
  activo         boolean DEFAULT true,
  created_date   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conductor (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  licencia     text,
  activo       boolean DEFAULT true,
  vehiculo_id  uuid REFERENCES vehiculo(id),
  created_date timestamptz DEFAULT now()
);

-- ============================================================
-- CONSUMIDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS consumidor (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_consumidor_id     uuid REFERENCES tipo_consumidor(id),
  tipo_consumidor_nombre text,
  nombre                 text NOT NULL,
  codigo_interno         text,
  combustible_id         uuid REFERENCES tipo_combustible(id),
  combustible_nombre     text,
  activo                 boolean DEFAULT true,
  responsable            text,
  conductor              text,
  funcion                text,
  litros_iniciales       numeric DEFAULT 0 NOT NULL,
  observaciones          text,
  datos_vehiculo         jsonb,
  datos_tanque           jsonb,
  datos_equipo           jsonb,
  created_date           timestamptz DEFAULT now()
);

-- ============================================================
-- PRECIOS DE COMBUSTIBLE
-- ============================================================
CREATE TABLE IF NOT EXISTS precio_combustible (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combustible_id  uuid REFERENCES tipo_combustible(id),
  precio_por_litro numeric NOT NULL,
  fecha_desde     date NOT NULL,
  fecha_hasta     date,
  created_date    timestamptz DEFAULT now()
);

-- ============================================================
-- MOVIMIENTOS (transacciones principales)
-- ============================================================
CREATE TABLE IF NOT EXISTS movimiento (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha                   date NOT NULL,
  tipo                    text NOT NULL CHECK (tipo IN ('COMPRA', 'RECARGA', 'DESPACHO')),
  tarjeta_id              uuid REFERENCES tarjeta(id),
  tarjeta_alias           text,
  combustible_id          uuid REFERENCES tipo_combustible(id),
  combustible_nombre      text,
  consumidor_id           uuid REFERENCES consumidor(id),
  consumidor_nombre       text,
  consumidor_origen_id    uuid REFERENCES consumidor(id),
  consumidor_origen_nombre text,
  litros                  numeric,
  monto                   numeric,
  precio                  numeric,
  odometro                numeric,
  km_recorridos           numeric,
  consumo_real            numeric,
  referencia              text,
  vehiculo_chapa          text,
  vehiculo_alias          text,
  vehiculo_origen_chapa   text,
  vehiculo_origen_alias   text,
  created_date            timestamptz DEFAULT now()
);

-- ============================================================
-- CONFIGURACIÓN DE ALERTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS config_alerta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumidor_id     uuid REFERENCES consumidor(id),
  email_destino     text,
  umbral_alerta_pct numeric DEFAULT 15,
  umbral_critico_pct numeric DEFAULT 30,
  alerta_email      boolean DEFAULT false,
  created_date      timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- La autorización por rol se gestiona en la app (Layout.jsx).
-- Aquí solo exigimos que el usuario esté autenticado.
-- ============================================================
ALTER TABLE user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_consumidor   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_combustible  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarjeta           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conductor         ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumidor        ENABLE ROW LEVEL SECURITY;
ALTER TABLE precio_combustible ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimiento        ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_alerta     ENABLE ROW LEVEL SECURITY;

-- user_roles: cualquier usuario autenticado puede leer/crear su propia fila;
--             solo superadmin gestiona roles (vía dashboard de Supabase o service key)
CREATE POLICY "authenticated_all" ON user_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Resto de tablas: acceso completo para usuarios autenticados
CREATE POLICY "authenticated_all" ON tipo_consumidor
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON tipo_combustible
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON tarjeta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON vehiculo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON conductor
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON consumidor
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON precio_combustible
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON movimiento
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON config_alerta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCIÓN: auto-crear fila en user_roles al primer login
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_roles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'auditor'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
