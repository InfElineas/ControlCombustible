-- Agrega lectura inicial de odómetro a vehículos

alter table public.vehiculos
  add column if not exists odometro_inicial numeric(14,1) not null default 0;

update public.vehiculos
set odometro_inicial = 0
where odometro_inicial is null;
