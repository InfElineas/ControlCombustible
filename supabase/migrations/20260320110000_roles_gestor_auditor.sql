-- Migración de roles: admin/operador -> gestor/auditor

alter table public.perfiles
  drop constraint if exists perfiles_role_check;

alter table public.perfiles
  add constraint perfiles_role_check
  check (role in ('auditor', 'gestor', 'superadmin'));

update public.perfiles
set role = case
  when role = 'admin' then 'gestor'
  when role = 'operador' then 'auditor'
  else role
end
where role in ('admin', 'operador');

alter table public.perfiles
  alter column role set default 'auditor';

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

-- Reemplazar políticas de escritura por manager/superadmin
-- combustibles
alter table public.combustibles enable row level security;
drop policy if exists "combustibles write admin" on public.combustibles;
drop policy if exists "combustibles write manager" on public.combustibles;
create policy "combustibles write manager" on public.combustibles
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- tarjetas
alter table public.tarjetas enable row level security;
drop policy if exists "tarjetas write admin" on public.tarjetas;
drop policy if exists "tarjetas write manager" on public.tarjetas;
create policy "tarjetas write manager" on public.tarjetas
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- vehiculos
alter table public.vehiculos enable row level security;
drop policy if exists "vehiculos write admin" on public.vehiculos;
drop policy if exists "vehiculos write manager" on public.vehiculos;
create policy "vehiculos write manager" on public.vehiculos
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- precios
drop policy if exists "precios write admin" on public.precios_combustible;
drop policy if exists "precios write manager" on public.precios_combustible;
create policy "precios write manager" on public.precios_combustible
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());

-- movimientos
drop policy if exists "movimientos update admin" on public.movimientos;
drop policy if exists "movimientos delete admin" on public.movimientos;
drop policy if exists "movimientos update manager" on public.movimientos;
drop policy if exists "movimientos delete manager" on public.movimientos;
create policy "movimientos update manager" on public.movimientos
for update to authenticated using (public.is_manager_user()) with check (public.is_manager_user());
create policy "movimientos delete manager" on public.movimientos
for delete to authenticated using (public.is_manager_user());

drop policy if exists "movimientos insert authenticated" on public.movimientos;
create policy "movimientos insert authenticated" on public.movimientos
for insert to authenticated with check (public.is_manager_user());

-- perfiles
drop policy if exists "perfiles admin read" on public.perfiles;
drop policy if exists "perfiles manager read" on public.perfiles;
create policy "perfiles manager read" on public.perfiles
for select to authenticated using (public.is_manager_user());

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
