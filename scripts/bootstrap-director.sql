-- 1. Cree primero el usuario en Supabase Dashboard:
-- Authentication > Users > Add user > Create new user.
-- Marque el correo como confirmado.
--
-- 2. Sustituya el correo del ejemplo y ejecute este bloque en SQL Editor.

do $$
declare
  target_email text := 'fcardenas058@gmail.com'; -- CAMBIAR
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'No existe un usuario Auth con el correo %', target_email;
  end if;

  insert into public.profiles (
    id,
    email,
    first_names,
    last_names,
    role,
    active
  )
  values (
    target_user_id,
    target_email,
    'Director',
    'UEF Loja',
    'director',
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        first_names = excluded.first_names,
        last_names = excluded.last_names,
        role = 'director',
        active = true;
end $$;
