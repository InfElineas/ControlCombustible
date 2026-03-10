# Control Combustible (React + Vite)

Aplicación para gestionar combustible de flota:
- Tarjetas de combustible
- Vehículos
- Tipos de combustible
- Precios por litro
- Movimientos (`RECARGA`, `COMPRA`, `DESPACHO`)
- Reportes y exportación CSV

## Stack
- React + Vite
- React Query
- Tailwind + shadcn/ui
- Supabase (REST API)

## Ejecutar en local
1. Instala dependencias:
   ```bash
   npm install
   ```
2. Crea `.env` en la raíz:
   ```bash
   VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<tu-anon-key>
   ```
3. Ejecuta:
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Crear base de datos en Supabase
Ejecuta este SQL en **SQL Editor**:

```sql
create extension if not exists "pgcrypto";

create table if not exists tarjetas (
  id uuid primary key default gen_random_uuid(),
  id_tarjeta text not null unique,
  alias text,
  moneda text not null default 'CUP',
  saldo_inicial numeric not null default 0,
  umbral_alerta numeric,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vehiculos (
  id uuid primary key default gen_random_uuid(),
  chapa text not null unique,
  alias text,
  area_centro text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tipos_combustible (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists precios_combustible (
  id uuid primary key default gen_random_uuid(),
  combustible_id uuid not null references tipos_combustible(id) on delete restrict,
  combustible_nombre text,
  precio_por_litro numeric not null,
  fecha_desde date not null,
  created_at timestamptz not null default now()
);

create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('RECARGA', 'COMPRA', 'DESPACHO')),
  tarjeta_id uuid references tarjetas(id) on delete restrict,
  tarjeta_alias text,
  monto numeric,
  vehiculo_chapa text,
  vehiculo_alias text,
  vehiculo_origen_chapa text,
  vehiculo_origen_alias text,
  combustible_id uuid references tipos_combustible(id) on delete restrict,
  combustible_nombre text,
  precio numeric,
  litros numeric,
  referencia text,
  created_at timestamptz not null default now()
);

alter table tarjetas enable row level security;
alter table vehiculos enable row level security;
alter table tipos_combustible enable row level security;
alter table precios_combustible enable row level security;
alter table movimientos enable row level security;

-- Solo para entorno local/demo con anon key (lectura/escritura abierta)
create policy if not exists "public_read_write_tarjetas" on tarjetas for all using (true) with check (true);
create policy if not exists "public_read_write_vehiculos" on vehiculos for all using (true) with check (true);
create policy if not exists "public_read_write_tipos_combustible" on tipos_combustible for all using (true) with check (true);
create policy if not exists "public_read_write_precios_combustible" on precios_combustible for all using (true) with check (true);
create policy if not exists "public_read_write_movimientos" on movimientos for all using (true) with check (true);
```

> Para producción, reemplaza esas policies por reglas con autenticación real.

## Nota sobre entidades
Los metadatos de modelo están en `entities/*.json` para evitar confusión con SQL ejecutable.
