-- ============================================================
-- UEF LOJA
-- REINICIO CONTROLADO DE ESQUEMA PUBLIC
-- VERSIÓN 2 - ADECUACIÓN NORMATIVA MINEDUC
--
-- IMPORTANTE:
-- Este script NO elimina usuarios de Supabase Auth.
-- El usuario maestro permanece en auth.users.
-- ============================================================

begin;

-- Elimina toda la estructura anterior de la aplicación:
-- tablas, vistas, funciones, triggers, políticas y datos
-- contenidos dentro del esquema public.
drop schema if exists public cascade;

-- Recrea el esquema limpio.
create schema public;

-- Permisos estándar requeridos por Supabase/PostgREST.
grant usage on schema public to postgres;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

grant all on schema public to postgres;
grant all on schema public to service_role;

-- Permite que las futuras tablas creadas por postgres
-- puedan ser utilizadas según las políticas RLS que
-- construiremos posteriormente.
alter default privileges for role postgres
in schema public
grant all on tables to postgres, service_role;

alter default privileges for role postgres
in schema public
grant all on sequences to postgres, service_role;

alter default privileges for role postgres
in schema public
grant all on functions to postgres, service_role;

commit;