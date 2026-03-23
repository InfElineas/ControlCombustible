create table if not exists public.bitacora_consumo (
  id uuid primary key default gen_random_uuid(),
  chapa text not null,
  fecha date not null,
  combustible_litros_inicio numeric(12,3),
  indice_consumo_fabricante_km numeric(12,4),
  origen_entrada text,
  combustible_litros_entrada numeric(12,3),
  combustible_litros_consumo numeric(12,3),
  final_en_tanque numeric(12,3),
  odometro_inicio numeric(14,1),
  odometro_final numeric(14,1),
  km_recorrido numeric(14,1),
  indice_consumo_momento_km numeric(12,4),
  indice_consumo_acumulado numeric(12,4),
  tipo_combustible text,
  indice_consumo_real numeric(12,4),
  created_by uuid references auth.users(id),
  created_date timestamptz not null default now()
);

alter table public.bitacora_consumo enable row level security;

drop policy if exists "bitacora read authenticated" on public.bitacora_consumo;
drop policy if exists "bitacora write manager" on public.bitacora_consumo;
create policy "bitacora read authenticated" on public.bitacora_consumo
for select to authenticated using (true);
create policy "bitacora write manager" on public.bitacora_consumo
for all to authenticated using (public.is_manager_user()) with check (public.is_manager_user());
