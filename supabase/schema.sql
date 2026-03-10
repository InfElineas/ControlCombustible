-- Extensiones
create extension if not exists "pgcrypto";

-- Catálogo de combustibles
create table if not exists public.combustibles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true,
  created_date timestamptz not null default now()
);

-- Tarjetas de pago/recarga
create table if not exists public.tarjetas (
  id uuid primary key default gen_random_uuid(),
  id_tarjeta text not null unique,
  alias text,
  moneda text not null check (moneda in ('USD', 'CUP', 'EUR', 'MLC')),
  saldo_inicial numeric(12,2) not null default 0,
  umbral_alerta numeric(12,2),
  activa boolean not null default true,
  created_date timestamptz not null default now()
);

-- Vehículos
create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  chapa text not null unique,
  alias text,
  area_centro text,
  activa boolean not null default true,
  created_date timestamptz not null default now()
);

-- Historial de precios por combustible
create table if not exists public.precios_combustible (
  id uuid primary key default gen_random_uuid(),
  combustible_id uuid not null references public.combustibles(id) on delete restrict,
  combustible_nombre text,
  precio_por_litro numeric(12,4) not null check (precio_por_litro >= 0),
  fecha_desde date not null,
  created_date timestamptz not null default now()
);
create index if not exists idx_precios_combustible_lookup on public.precios_combustible(combustible_id, fecha_desde desc);

-- Movimientos de operación
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('RECARGA', 'COMPRA', 'DESPACHO')),
  tarjeta_id uuid references public.tarjetas(id) on delete set null,
  tarjeta_alias text,
  monto numeric(12,2),
  vehiculo_chapa text,
  vehiculo_alias text,
  vehiculo_origen_chapa text,
  vehiculo_origen_alias text,
  combustible_id uuid references public.combustibles(id) on delete set null,
  combustible_nombre text,
  precio numeric(12,4),
  litros numeric(12,3),
  odometro numeric(14,1),
  referencia text,
  created_date timestamptz not null default now(),
  constraint chk_movimiento_monto check (monto is null or monto >= 0),
  constraint chk_movimiento_litros check (litros is null or litros >= 0),
  constraint chk_movimiento_precio check (precio is null or precio >= 0)
);
create index if not exists idx_movimientos_fecha on public.movimientos(fecha desc);
create index if not exists idx_movimientos_tarjeta on public.movimientos(tarjeta_id);
create index if not exists idx_movimientos_combustible on public.movimientos(combustible_id);

-- Vista operativa para dashboard/reportes
create or replace view public.v_saldos_tarjeta as
select
  t.id,
  t.id_tarjeta,
  t.alias,
  t.moneda,
  t.saldo_inicial
    + coalesce(sum(case when m.tipo = 'RECARGA' then m.monto end), 0)
    - coalesce(sum(case when m.tipo = 'COMPRA' then m.monto end), 0) as saldo_actual
from public.tarjetas t
left join public.movimientos m on m.tarjeta_id = t.id
group by t.id, t.id_tarjeta, t.alias, t.moneda, t.saldo_inicial;

-- RLS base (ajustar según estrategia de usuarios/roles)
alter table public.combustibles enable row level security;
alter table public.tarjetas enable row level security;
alter table public.vehiculos enable row level security;
alter table public.precios_combustible enable row level security;
alter table public.movimientos enable row level security;

create policy "allow authenticated read" on public.combustibles for select to authenticated using (true);
create policy "allow authenticated write" on public.combustibles for all to authenticated using (true) with check (true);

create policy "allow authenticated read" on public.tarjetas for select to authenticated using (true);
create policy "allow authenticated write" on public.tarjetas for all to authenticated using (true) with check (true);

create policy "allow authenticated read" on public.vehiculos for select to authenticated using (true);
create policy "allow authenticated write" on public.vehiculos for all to authenticated using (true) with check (true);

create policy "allow authenticated read" on public.precios_combustible for select to authenticated using (true);
create policy "allow authenticated write" on public.precios_combustible for all to authenticated using (true) with check (true);

create policy "allow authenticated read" on public.movimientos for select to authenticated using (true);
create policy "allow authenticated write" on public.movimientos for all to authenticated using (true) with check (true);
