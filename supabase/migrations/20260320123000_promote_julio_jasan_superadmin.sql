-- Promoción solicitada: usuario julio.jasan -> superadmin

do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where split_part(lower(email), '@', 1) = 'julio.jasan'
  order by created_at asc
  limit 1;

  if target_user_id is null then
    raise notice 'No se encontró usuario con alias julio.jasan en auth.users';
    return;
  end if;

  insert into public.perfiles (user_id, full_name, role)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'superadmin'
  from auth.users u
  where u.id = target_user_id
  on conflict (user_id) do update
    set role = 'superadmin';

  raise notice 'Usuario % promovido a superadmin', target_user_id;
end;
$$;
