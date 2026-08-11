-- =====================================================================
-- UEF LOJA - FASE 4.2
-- CUALITATIVAS, COMPORTAMIENTO, ASISTENCIA Y BOLETAS V2
-- Migración: 20260811020000_complementarios_boletas_v2.sql
--
-- Requiere:
--   20260810235000_core_v2_normativa.sql
--   20260810235500_evaluation_engine_v2.sql
--   20260811014500_resultados_optimizados_v2.sql
--
-- Esta migración NO modifica calificaciones cuantitativas existentes.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. VALORACIONES CUALITATIVAS POR ASIGNATURA
-- ---------------------------------------------------------------------

create table public.qualitative_subject_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  letter text not null,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint qualitative_subject_records_unique
    unique (enrollment_id, term_id, subject_id),

  constraint qualitative_subject_records_letter_chk
    check (letter in ('A+','A-','B+','B-','C+','C-','D+','D-','E+','E-'))
);

create index idx_qualitative_subject_records_enrollment_term
  on public.qualitative_subject_records (enrollment_id, term_id);

create trigger trg_qualitative_subject_records_updated_at
before update on public.qualitative_subject_records
for each row execute function public.set_updated_at();

create or replace function public.validate_qualitative_subject_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_enrollment_year uuid;
  v_course_grade uuid;
  v_term_year uuid;
begin
  select e.academic_year_id, c.grade_level_id
    into v_enrollment_year, v_course_grade
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  where e.id = new.enrollment_id;

  select academic_year_id
    into v_term_year
  from public.terms
  where id = new.term_id;

  if v_enrollment_year is null or v_term_year is null then
    raise exception 'No fue posible validar la matrícula o el trimestre.';
  end if;

  if v_enrollment_year <> v_term_year then
    raise exception 'La matrícula y el trimestre pertenecen a años lectivos diferentes.';
  end if;

  if not exists (
    select 1
    from public.subjects s
    join public.grade_subjects gs
      on gs.subject_id = s.id
     and gs.grade_level_id = v_course_grade
     and gs.active = true
    where s.id = new.subject_id
      and s.active = true
      and s.kind = 'qualitative'::public.subject_kind
  ) then
    raise exception 'La asignatura seleccionada no es cualitativa o no corresponde al grado.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_qualitative_subject_record
before insert or update of enrollment_id, term_id, subject_id
on public.qualitative_subject_records
for each row execute function public.validate_qualitative_subject_record();

-- ---------------------------------------------------------------------
-- 2. CATÁLOGO Y REGISTRO DE COMPORTAMIENTO
-- Las descripciones son configurables y no alteran promedios académicos.
-- ---------------------------------------------------------------------

create table public.behavior_catalog (
  code text primary key,
  description text not null,
  active boolean not null default true,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint behavior_catalog_code_chk
    check (code in ('A','B','C','D','E'))
);

create trigger trg_behavior_catalog_updated_at
before update on public.behavior_catalog
for each row execute function public.set_updated_at();

insert into public.behavior_catalog (code, description, active, sort_order)
values
  ('A', 'Lidera y promueve activamente iniciativas que favorecen la convivencia armónica y pacífica.', true, 10),
  ('B', 'Se involucra y participa en iniciativas que favorecen la convivencia pacífica.', true, 20),
  ('C', 'Participa en acciones de convivencia cuando recibe orientación y acompañamiento.', true, 30),
  ('D', 'Requiere acompañamiento frecuente para fortalecer su participación y convivencia.', true, 40),
  ('E', 'Requiere seguimiento continuo para fortalecer conductas favorables a la convivencia.', true, 50)
on conflict (code)
do update set
  description = excluded.description,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

create table public.behavior_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  behavior_code text not null references public.behavior_catalog(code) on delete restrict,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint behavior_records_unique
    unique (enrollment_id, term_id)
);

create index idx_behavior_records_enrollment_term
  on public.behavior_records (enrollment_id, term_id);

create trigger trg_behavior_records_updated_at
before update on public.behavior_records
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. ASISTENCIA RESUMIDA
-- Se registra al final del trimestre; no requiere asistencia diaria.
-- ---------------------------------------------------------------------

create table public.attendance_summaries (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  attended_days integer not null default 0,
  justified_absences integer not null default 0,
  unjustified_absences integer not null default 0,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_summaries_unique
    unique (enrollment_id, term_id),

  constraint attendance_summaries_nonnegative_chk
    check (
      attended_days >= 0
      and justified_absences >= 0
      and unjustified_absences >= 0
    )
);

create index idx_attendance_summaries_enrollment_term
  on public.attendance_summaries (enrollment_id, term_id);

create trigger trg_attendance_summaries_updated_at
before update on public.attendance_summaries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. VALIDACIÓN DE MATRÍCULA / TRIMESTRE PARA COMPORTAMIENTO Y ASISTENCIA
-- ---------------------------------------------------------------------

create or replace function public.validate_enrollment_term_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_enrollment_year uuid;
  v_term_year uuid;
begin
  select academic_year_id
    into v_enrollment_year
  from public.enrollments
  where id = new.enrollment_id;

  select academic_year_id
    into v_term_year
  from public.terms
  where id = new.term_id;

  if v_enrollment_year is null or v_term_year is null then
    raise exception 'No fue posible validar matrícula y trimestre.';
  end if;

  if v_enrollment_year <> v_term_year then
    raise exception 'La matrícula y el trimestre pertenecen a años lectivos diferentes.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_behavior_context
before insert or update of enrollment_id, term_id
on public.behavior_records
for each row execute function public.validate_enrollment_term_context();

create trigger trg_validate_attendance_context
before insert or update of enrollment_id, term_id
on public.attendance_summaries
for each row execute function public.validate_enrollment_term_context();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.qualitative_subject_records enable row level security;
alter table public.behavior_catalog enable row level security;
alter table public.behavior_records enable row level security;
alter table public.attendance_summaries enable row level security;

create policy "active users read qualitative records"
on public.qualitative_subject_records
for select to authenticated
using (public.current_profile_active());

create policy "active users read behavior catalog"
on public.behavior_catalog
for select to authenticated
using (public.current_profile_active());

create policy "active users read behavior records"
on public.behavior_records
for select to authenticated
using (public.current_profile_active());

create policy "active users read attendance summaries"
on public.attendance_summaries
for select to authenticated
using (public.current_profile_active());

create policy "director manages qualitative records"
on public.qualitative_subject_records
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages behavior catalog"
on public.behavior_catalog
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages behavior records"
on public.behavior_records
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages attendance summaries"
on public.attendance_summaries
for all to authenticated
using (public.is_director())
with check (public.is_director());

-- ---------------------------------------------------------------------
-- 6. PRIVILEGIOS POSTGREST
-- ---------------------------------------------------------------------

grant select, insert, update, delete
on public.qualitative_subject_records,
   public.behavior_catalog,
   public.behavior_records,
   public.attendance_summaries
to authenticated;

commit;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'qualitative_subject_records',
    'behavior_catalog',
    'behavior_records',
    'attendance_summaries'
  )
order by table_name;

select code, description, active
from public.behavior_catalog
order by sort_order;

select code, name, kind
from public.subjects
where kind = 'qualitative'::public.subject_kind
order by sort_order;
