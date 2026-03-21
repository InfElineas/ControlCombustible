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
  odometro_inicial numeric(14,1) not null default 0,
  activa boolean not null default true,
  created_date timestamptz not null default now()
);

alter table public.vehiculos add column if not exists odometro_inicial numeric(14,1) not null default 0;

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
  created_by uuid references auth.users(id),
  created_date timestamptz not null default now(),
  constraint chk_movimiento_monto check (monto is null or monto >= 0),
  constraint chk_movimiento_litros check (litros is null or litros >= 0),
  constraint chk_movimiento_precio check (precio is null or precio >= 0)
);

-- Compatibilidad con instalaciones existentes
alter table public.movimientos add column if not exists created_by uuid references auth.users(id);
alter table public.movimientos alter column created_by set default auth.uid();

create index if not exists idx_movimientos_fecha on public.movimientos(fecha desc);
create index if not exists idx_movimientos_tarjeta on public.movimientos(tarjeta_id);
create index if not exists idx_movimientos_combustible on public.movimientos(combustible_id);
create index if not exists idx_movimientos_created_by on public.movimientos(created_by);

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

-- Roles de usuario (RBAC)
create table if not exists public.perfiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'auditor' check (role in ('auditor', 'gestor', 'superadmin')),
  created_date timestamptz not null default now()
);

alter table public.combustibles enable row level security;
alter table public.tarjetas enable row level security;
alter table public.vehiculos enable row level security;
alter table public.precios_combustible enable row level security;
alter table public.movimientos enable row level security;
alter table public.perfiles enable row level security;

-- Helpers RBAC
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.perfiles p where p.user_id = auth.uid()), 'auditor');
$$;

create or replace function public.is_manager_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('gestor', 'superadmin');
$$;

create or replace function public.is_superadmin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'superadmin';
$$;

-- Policies idempotentes
-- combustibles
drop policy if exists "combustibles read authenticated" on public.combustibles;
drop policy if exists "combustibles write admin" on public.combustibles;
drop policy if exists "combustibles write manager" on public.combustibles;
create policy "combustibles read authenticated" on public.combustibles
for select to authenticated using (true);
create policy "combustibles write manager" on public.combustibles
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- tarjetas
drop policy if exists "tarjetas read authenticated" on public.tarjetas;
drop policy if exists "tarjetas write admin" on public.tarjetas;
drop policy if exists "tarjetas write manager" on public.tarjetas;
create policy "tarjetas read authenticated" on public.tarjetas
for select to authenticated using (true);
create policy "tarjetas write manager" on public.tarjetas
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- vehiculos
drop policy if exists "vehiculos read authenticated" on public.vehiculos;
drop policy if exists "vehiculos write admin" on public.vehiculos;
drop policy if exists "vehiculos write manager" on public.vehiculos;
create policy "vehiculos read authenticated" on public.vehiculos
for select to authenticated using (true);
create policy "vehiculos write manager" on public.vehiculos
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- precios
drop policy if exists "precios read authenticated" on public.precios_combustible;
drop policy if exists "precios write admin" on public.precios_combustible;
drop policy if exists "precios write manager" on public.precios_combustible;
create policy "precios read authenticated" on public.precios_combustible
for select to authenticated using (true);
create policy "precios write manager" on public.precios_combustible
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- movimientos
drop policy if exists "movimientos read authenticated" on public.movimientos;
drop policy if exists "movimientos insert authenticated" on public.movimientos;
drop policy if exists "movimientos update admin" on public.movimientos;
drop policy if exists "movimientos delete admin" on public.movimientos;
drop policy if exists "movimientos update manager" on public.movimientos;
drop policy if exists "movimientos delete manager" on public.movimientos;
create policy "movimientos read authenticated" on public.movimientos
for select to authenticated using (true);
create policy "movimientos insert authenticated" on public.movimientos
for insert to authenticated with check (public.is_manager_user());
create policy "movimientos update manager" on public.movimientos
for update to authenticated using (public.is_manager_user()) with check (public.is_manager_user());
create policy "movimientos delete manager" on public.movimientos
for delete to authenticated using (public.is_manager_user());

-- perfiles
drop policy if exists "perfiles own read" on public.perfiles;
drop policy if exists "perfiles admin read" on public.perfiles;
drop policy if exists "perfiles manager read" on public.perfiles;
drop policy if exists "perfiles superadmin manage" on public.perfiles;
create policy "perfiles own read" on public.perfiles
for select to authenticated using (auth.uid() = user_id);
create policy "perfiles manager read" on public.perfiles
for select to authenticated using (public.is_manager_user());
create policy "perfiles superadmin manage" on public.perfiles
for all to authenticated
using (public.is_superadmin_user())
with check (public.is_superadmin_user());

-- Alta automática de perfil al crear usuario auth
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (user_id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'auditor')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

-- Backfill para usuarios creados antes del trigger
insert into public.perfiles (user_id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'auditor'
from auth.users u
left join public.perfiles p on p.user_id = u.id
where p.user_id is null;

-- Bootstrap/promoción: asegura perfil y promueve a superadmin por email
create or replace function public.promote_superadmin_by_email(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No existe usuario con email %', target_email;
  end if;

  insert into public.perfiles (user_id, full_name, role)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'superadmin'
  from auth.users u
  where u.id = target_user_id
  on conflict (user_id) do update
    set role = 'superadmin';
end;
$$;

create or replace function public.set_user_role_by_email(target_email text, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if new_role not in ('auditor', 'gestor', 'superadmin') then
    raise exception 'Rol inválido: %. Usa auditor, gestor o superadmin.', new_role;
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No existe usuario con email %', target_email;
  end if;

  insert into public.perfiles (user_id, full_name, role)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), new_role
  from auth.users u
  where u.id = target_user_id
  on conflict (user_id) do update
    set role = excluded.role;
end;
$$;

-- Uso:
-- select public.promote_superadmin_by_email('informaticoelineas3@gmail.com');
-- Verificación:
-- select p.role, u.email from public.perfiles p join auth.users u on u.id = p.user_id where lower(u.email)=lower('informaticoelineas3@gmail.com');
