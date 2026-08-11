-- =====================================================================
-- UEF LOJA - ESQUEMA NÚCLEO V2
-- Adecuación normativa por subnivel
-- Fecha: 2026-08-10
--
-- Este script asume que el esquema public ya fue limpiado.
-- NO modifica ni elimina auth.users.
-- Conserva y vincula el usuario maestro existente:
--   fcardenas058@gmail.com
-- =====================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('director', 'docente');
  end if;

  if not exists (select 1 from pg_type where typname = 'academic_sublevel') then
    create type public.academic_sublevel as enum ('elemental', 'media');
  end if;

  if not exists (select 1 from pg_type where typname = 'evaluation_model') then
    create type public.evaluation_model as enum ('simple_average', 'weighted_70_30');
  end if;

  if not exists (select 1 from pg_type where typname = 'subject_kind') then
    create type public.subject_kind as enum ('quantitative', 'qualitative');
  end if;

  if not exists (select 1 from pg_type where typname = 'enrollment_status') then
    create type public.enrollment_status as enum (
      'active',
      'completed',
      'withdrawn',
      'transferred'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. FUNCIONES COMUNES
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. CONFIGURACIÓN INSTITUCIONAL
-- ---------------------------------------------------------------------

create table public.institution_settings (
  id uuid primary key default gen_random_uuid(),
  institution_name text not null default 'Unidad Educativa Fiscal Loja',
  short_name text not null default 'UEF Loja',
  amie_code text,
  district text,
  circuit text,
  address text,
  phone text,
  email text,
  principal_name text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index institution_settings_single_row
  on public.institution_settings ((true));

create trigger trg_institution_settings_updated_at
before update on public.institution_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. PERFILES DE USUARIO
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_names text,
  last_names text,
  role public.app_role not null default 'docente',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique
  on public.profiles (lower(email));

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_profile_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  );
$$;

create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = 'director'
  );
$$;

-- Se crea un perfil automáticamente para nuevos usuarios Auth.
-- El rol por defecto es docente. El director puede cambiarlo después.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_names,
    last_names,
    role,
    active
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'first_names', ''),
    nullif(new.raw_user_meta_data ->> 'last_names', ''),
    case
      when new.raw_user_meta_data ->> 'role' = 'director'
        then 'director'::public.app_role
      else 'docente'::public.app_role
    end,
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    first_names = coalesce(excluded.first_names, public.profiles.first_names),
    last_names = coalesce(excluded.last_names, public.profiles.last_names),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 5. AÑOS LECTIVOS Y TRIMESTRES
-- ---------------------------------------------------------------------

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  active boolean not null default false,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_dates_chk
    check (
      start_date is null
      or end_date is null
      or end_date >= start_date
    )
);

create unique index academic_years_name_unique
  on public.academic_years (lower(name));

create unique index academic_years_only_one_active
  on public.academic_years ((true))
  where active = true;

create trigger trg_academic_years_updated_at
before update on public.academic_years
for each row execute function public.set_updated_at();

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  number smallint not null check (number between 1 and 3),
  name text not null,
  start_date date,
  end_date date,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_year_number_unique unique (academic_year_id, number),
  constraint terms_dates_chk
    check (
      start_date is null
      or end_date is null
      or end_date >= start_date
    )
);

create trigger trg_terms_updated_at
before update on public.terms
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. CATÁLOGO DE GRADOS Y MODELO DE EVALUACIÓN
-- ---------------------------------------------------------------------

create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  ordinal smallint not null unique,
  sublevel public.academic_sublevel not null,
  evaluation_model public.evaluation_model not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.grade_levels
  (code, name, ordinal, sublevel, evaluation_model)
values
  ('2EGB', '2DO DE EGB', 2, 'elemental', 'simple_average'),
  ('3EGB', '3RO DE EGB', 3, 'elemental', 'simple_average'),
  ('4EGB', '4TO DE EGB', 4, 'elemental', 'simple_average'),
  ('5EGB', '5TO DE EGB', 5, 'media', 'weighted_70_30'),
  ('6EGB', '6TO DE EGB', 6, 'media', 'weighted_70_30'),
  ('7EGB', '7MO DE EGB', 7, 'media', 'weighted_70_30')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 7. CURSOS Y PARALELOS
-- ---------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  grade_level_id uuid not null references public.grade_levels(id) on delete restrict,
  parallel text not null,
  tutor_profile_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_parallel_chk
    check (length(trim(parallel)) between 1 and 5),
  constraint courses_unique
    unique (academic_year_id, grade_level_id, parallel)
);

create trigger trg_courses_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 8. ASIGNATURAS
-- ---------------------------------------------------------------------

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  abbreviation text not null,
  kind public.subject_kind not null default 'quantitative',
  active boolean not null default true,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_subjects_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

insert into public.subjects
  (code, name, abbreviation, kind, sort_order)
values
  ('LEN', 'Lengua y Literatura', 'LEN', 'quantitative', 10),
  ('MAT', 'Matemática', 'MAT', 'quantitative', 20),
  ('CCNN', 'Ciencias Naturales', 'CCNN', 'quantitative', 30),
  ('EESS', 'Estudios Sociales', 'EESS', 'quantitative', 40),
  ('ECA', 'Educación Cultural y Artística', 'ECA', 'quantitative', 50),
  ('EFI', 'Educación Física', 'EFI', 'quantitative', 60),
  ('ING', 'Inglés', 'ING', 'quantitative', 70),
  ('AAL', 'Animación a la Lectura', 'AAL', 'qualitative', 80),
  ('CAI', 'Cívica y Acompañamiento Integral en el Aula', 'CAI', 'qualitative', 90)
on conflict (code) do nothing;

-- Relación entre grados y asignaturas.
create table public.grade_subjects (
  grade_level_id uuid not null references public.grade_levels(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (grade_level_id, subject_id)
);

insert into public.grade_subjects (grade_level_id, subject_id)
select g.id, s.id
from public.grade_levels g
cross join public.subjects s
where g.ordinal between 2 and 7
  and s.code in ('LEN','MAT','CCNN','EESS','ECA','EFI','ING','AAL','CAI')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 9. DOCENTES
-- ---------------------------------------------------------------------

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  first_names text not null,
  last_names text not null,
  national_id text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teachers_national_id_unique
  on public.teachers (national_id)
  where national_id is not null;

create trigger trg_teachers_updated_at
before update on public.teachers
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 10. ESTUDIANTES Y MATRÍCULAS
-- ---------------------------------------------------------------------

create table public.students (
  id uuid primary key default gen_random_uuid(),
  first_names text not null,
  last_names text not null,
  national_id text,
  birth_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index students_national_id_unique
  on public.students (national_id)
  where national_id is not null;

create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  status public.enrollment_status not null default 'active',
  enrolled_on date not null default current_date,
  withdrawn_on date,
  withdrawal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_student_year_unique
    unique (student_id, academic_year_id),
  constraint enrollments_withdrawn_date_chk
    check (
      withdrawn_on is null
      or withdrawn_on >= enrolled_on
    )
);

create trigger trg_enrollments_updated_at
before update on public.enrollments
for each row execute function public.set_updated_at();

-- Evita matricular un estudiante en un curso de otro año lectivo.
create or replace function public.validate_enrollment_course_year()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_course_year uuid;
begin
  select academic_year_id
  into v_course_year
  from public.courses
  where id = new.course_id;

  if v_course_year is null then
    raise exception 'El curso seleccionado no existe.';
  end if;

  if v_course_year <> new.academic_year_id then
    raise exception 'El curso no pertenece al año lectivo seleccionado.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_enrollment_course_year
before insert or update of course_id, academic_year_id
on public.enrollments
for each row execute function public.validate_enrollment_course_year();

-- ---------------------------------------------------------------------
-- 11. ASIGNACIONES DOCENTES
-- ---------------------------------------------------------------------

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_assignments_unique
    unique (academic_year_id, course_id, subject_id)
);

create trigger trg_teacher_assignments_updated_at
before update on public.teacher_assignments
for each row execute function public.set_updated_at();

create or replace function public.validate_teacher_assignment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_course_year uuid;
  v_grade_level uuid;
begin
  select c.academic_year_id, c.grade_level_id
  into v_course_year, v_grade_level
  from public.courses c
  where c.id = new.course_id;

  if v_course_year is null then
    raise exception 'El curso seleccionado no existe.';
  end if;

  if v_course_year <> new.academic_year_id then
    raise exception 'El curso no pertenece al año lectivo de la asignación.';
  end if;

  if not exists (
    select 1
    from public.grade_subjects gs
    where gs.grade_level_id = v_grade_level
      and gs.subject_id = new.subject_id
      and gs.active = true
  ) then
    raise exception 'La asignatura no está habilitada para el grado seleccionado.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_teacher_assignment
before insert or update of academic_year_id, course_id, subject_id
on public.teacher_assignments
for each row execute function public.validate_teacher_assignment();

-- ---------------------------------------------------------------------
-- 12. RLS
-- ---------------------------------------------------------------------

alter table public.institution_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;
alter table public.grade_levels enable row level security;
alter table public.courses enable row level security;
alter table public.subjects enable row level security;
alter table public.grade_subjects enable row level security;
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.teacher_assignments enable row level security;

-- Lectura general para usuarios autenticados y activos.
create policy "active users read institution"
on public.institution_settings
for select to authenticated
using (public.current_profile_active());

create policy "active users read profiles"
on public.profiles
for select to authenticated
using (public.current_profile_active());

create policy "active users read academic years"
on public.academic_years
for select to authenticated
using (public.current_profile_active());

create policy "active users read terms"
on public.terms
for select to authenticated
using (public.current_profile_active());

create policy "active users read grade levels"
on public.grade_levels
for select to authenticated
using (public.current_profile_active());

create policy "active users read courses"
on public.courses
for select to authenticated
using (public.current_profile_active());

create policy "active users read subjects"
on public.subjects
for select to authenticated
using (public.current_profile_active());

create policy "active users read grade subjects"
on public.grade_subjects
for select to authenticated
using (public.current_profile_active());

create policy "active users read teachers"
on public.teachers
for select to authenticated
using (public.current_profile_active());

create policy "active users read students"
on public.students
for select to authenticated
using (public.current_profile_active());

create policy "active users read enrollments"
on public.enrollments
for select to authenticated
using (public.current_profile_active());

create policy "active users read assignments"
on public.teacher_assignments
for select to authenticated
using (public.current_profile_active());

-- Gestión administrativa para director.
create policy "director manages institution"
on public.institution_settings
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages profiles"
on public.profiles
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages academic years"
on public.academic_years
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages terms"
on public.terms
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages grade levels"
on public.grade_levels
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages courses"
on public.courses
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages subjects"
on public.subjects
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages grade subjects"
on public.grade_subjects
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages teachers"
on public.teachers
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages students"
on public.students
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages enrollments"
on public.enrollments
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages assignments"
on public.teacher_assignments
for all to authenticated
using (public.is_director())
with check (public.is_director());

-- ---------------------------------------------------------------------
-- 13. PRIVILEGIOS API / POSTGREST
-- ---------------------------------------------------------------------

-- Después de recrear el esquema public, estos permisos son necesarios
-- para que los usuarios autenticados puedan operar a través de PostgREST.
-- Las políticas RLS anteriores siguen decidiendo qué acciones se permiten.
grant select, insert, update, delete
on all tables in schema public
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

grant execute
on all functions in schema public
to authenticated;

-- Permisos por defecto para las tablas, secuencias y funciones que se
-- crearán en las siguientes migraciones V2.
alter default privileges for role postgres
in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges for role postgres
in schema public
grant usage, select on sequences to authenticated;

alter default privileges for role postgres
in schema public
grant execute on functions to authenticated;

-- ---------------------------------------------------------------------
-- 14. DATOS INICIALES
-- ---------------------------------------------------------------------

insert into public.institution_settings (
  institution_name,
  short_name
)
values (
  'Unidad Educativa Fiscal Loja',
  'UEF Loja'
)
on conflict do nothing;

-- Recrea el perfil del usuario maestro existente.
insert into public.profiles (
  id,
  email,
  first_names,
  last_names,
  role,
  active
)
select
  u.id,
  coalesce(u.email, 'fcardenas058@gmail.com'),
  coalesce(nullif(u.raw_user_meta_data ->> 'first_names', ''), 'Fernando'),
  coalesce(nullif(u.raw_user_meta_data ->> 'last_names', ''), 'Cárdenas'),
  'director'::public.app_role,
  true
from auth.users u
where lower(u.email) = lower('fcardenas058@gmail.com')
on conflict (id) do update
set
  email = excluded.email,
  first_names = excluded.first_names,
  last_names = excluded.last_names,
  role = 'director',
  active = true,
  updated_at = now();

-- Detiene la migración si el maestro no existe en Auth.
do $$
begin
  if not exists (
    select 1
    from public.profiles
    where lower(email) = lower('fcardenas058@gmail.com')
      and role = 'director'
      and active = true
  ) then
    raise exception
      'No se encontró el usuario maestro fcardenas058@gmail.com en auth.users. Se cancela la migración.';
  end if;
end
$$;

commit;
