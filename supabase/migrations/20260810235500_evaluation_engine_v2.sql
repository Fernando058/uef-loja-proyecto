-- =====================================================================
-- UEF LOJA - FASE 3
-- MOTOR DE EVALUACIÓN V2
-- Migración: 20260810235500_evaluation_engine_v2.sql
--
-- Requiere previamente:
--   20260810235000_core_v2_normativa.sql
--
-- Principios implementados:
--   * EGB Elemental (2.º-4.º): promedio simple de aportes.
--   * EGB Media (5.º-7.º): 70 % formativa + 30 % sumativa.
--   * Calificaciones ordinarias válidas: 1,00 a 10,00; NULL = no registrada.
--   * Proyecto interdisciplinar con indicadores por asignatura,
--     producto final y exposición.
--   * Mejora directa y mejora con refuerzo para evaluaciones sumativas.
--   * Los promedios de mejora conservan la calificación inicial si
--     el resultado no la supera.
--   * Se detecta elegibilidad para supletorio en EGB Media (4,01-6,99).
--
-- Importante:
--   Esta migración NO implementa todavía una decisión definitiva de
--   promoción/repitencia ni transforma automáticamente el supletorio
--   en nota final. Eso se realizará en la fase de promoción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assessment_category') then
    create type public.assessment_category as enum ('formative', 'summative');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('draft', 'active', 'closed');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 2. FUNCIONES NUMÉRICAS Y CUALITATIVAS
-- ---------------------------------------------------------------------

create or replace function public.trunc2(p_value numeric)
returns numeric
language sql
immutable
strict
as $$
  select trunc(p_value, 2);
$$;

create or replace function public.round2(p_value numeric)
returns numeric
language sql
immutable
strict
as $$
  select round(p_value, 2);
$$;

create or replace function public.qualitative_letter(p_score numeric)
returns text
language sql
immutable
as $$
  select case
    when p_score is null then null
    when p_score >= 9.50 then 'A+'
    when p_score >= 8.50 then 'A-'
    when p_score >= 7.50 then 'B+'
    when p_score >= 6.50 then 'B-'
    when p_score >= 5.50 then 'C+'
    when p_score >= 4.50 then 'C-'
    when p_score >= 3.50 then 'D+'
    when p_score >= 2.50 then 'D-'
    when p_score >= 1.50 then 'E+'
    else 'E-'
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. CATÁLOGO DE ACTIVIDADES
-- ---------------------------------------------------------------------

create table public.assessment_activity_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  default_category public.assessment_category,
  active boolean not null default true,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_assessment_activity_types_updated_at
before update on public.assessment_activity_types
for each row execute function public.set_updated_at();

insert into public.assessment_activity_types
  (code, name, default_category, sort_order)
values
  ('TAI',  'Tareas / deberes',                  'formative', 10),
  ('LO',   'Lección oral',                      'formative', 20),
  ('LE',   'Lección escrita',                   'formative', 30),
  ('PE',   'Prueba base estructurada',          'formative', 40),
  ('TAG',  'Talleres',                          'formative', 50),
  ('EXPO', 'Exposiciones',                      'formative', 60),
  ('EXP',  'Experimentos',                      'formative', 70),
  ('PST',  'Presentaciones artísticas/científicas','formative', 80),
  ('RP',   'Refuerzo pedagógico',               null,        90),
  ('INV',  'Investigación',                     'formative', 100),
  ('PROY', 'Proyecto',                          'summative', 110),
  ('ENS',  'Ensayo',                            'formative', 120),
  ('DBT',  'Debate',                            'formative', 130),
  ('BLG',  'Blog',                              'formative', 140),
  ('VID',  'Video',                             'formative', 150),
  ('PDC',  'Podcast',                           'formative', 160),
  ('SUM',  'Evaluación sumativa',               'summative', 170)
on conflict (code) do update
set
  name = excluded.name,
  default_category = excluded.default_category,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 4. PROYECTOS INTERDISCIPLINARES
-- ---------------------------------------------------------------------

create table public.interdisciplinary_projects (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  description text,
  product_description text,
  presentation_description text,
  status public.project_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interdisciplinary_projects_unique
    unique (term_id, course_id, name)
);

create trigger trg_interdisciplinary_projects_updated_at
before update on public.interdisciplinary_projects
for each row execute function public.set_updated_at();

create table public.project_subjects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.interdisciplinary_projects(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_assignment_id uuid references public.teacher_assignments(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_subjects_unique unique (project_id, subject_id)
);

create trigger trg_project_subjects_updated_at
before update on public.project_subjects
for each row execute function public.set_updated_at();

create table public.project_indicators (
  id uuid primary key default gen_random_uuid(),
  project_subject_id uuid not null references public.project_subjects(id) on delete cascade,
  code text,
  description text not null,
  sort_order smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_project_indicators_updated_at
before update on public.project_indicators
for each row execute function public.set_updated_at();

create table public.project_indicator_scores (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.project_indicators(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  score numeric(4,2),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_indicator_scores_unique unique (indicator_id, enrollment_id),
  constraint project_indicator_scores_scale_chk
    check (score is null or score between 1.00 and 10.00)
);

create trigger trg_project_indicator_scores_updated_at
before update on public.project_indicator_scores
for each row execute function public.set_updated_at();

-- Producto final y exposición pertenecen al proyecto y al estudiante.
-- Son comunes a las asignaturas participantes; cada asignatura conserva
-- sus propios indicadores curriculares.
create table public.project_student_components (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.interdisciplinary_projects(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  product_score numeric(4,2),
  presentation_score numeric(4,2),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_student_components_unique unique (project_id, enrollment_id),
  constraint project_product_scale_chk
    check (product_score is null or product_score between 1.00 and 10.00),
  constraint project_presentation_scale_chk
    check (presentation_score is null or presentation_score between 1.00 and 10.00)
);

create trigger trg_project_student_components_updated_at
before update on public.project_student_components
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. VALIDACIÓN DEL PROYECTO
-- ---------------------------------------------------------------------

create or replace function public.validate_project_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_term_year uuid;
  v_course_year uuid;
begin
  select academic_year_id
    into v_term_year
  from public.terms
  where id = new.term_id;

  select academic_year_id
    into v_course_year
  from public.courses
  where id = new.course_id;

  if v_term_year is null then
    raise exception 'El trimestre seleccionado no existe.';
  end if;

  if v_course_year is null then
    raise exception 'El curso seleccionado no existe.';
  end if;

  if v_term_year <> new.academic_year_id
     or v_course_year <> new.academic_year_id then
    raise exception 'Proyecto, trimestre y curso deben pertenecer al mismo año lectivo.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_project_context
before insert or update of academic_year_id, term_id, course_id
on public.interdisciplinary_projects
for each row execute function public.validate_project_context();

create or replace function public.validate_project_subject()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_grade_level_id uuid;
  v_course_id uuid;
begin
  select c.grade_level_id, p.course_id
    into v_grade_level_id, v_course_id
  from public.interdisciplinary_projects p
  join public.courses c on c.id = p.course_id
  where p.id = new.project_id;

  if v_grade_level_id is null then
    raise exception 'El proyecto seleccionado no existe.';
  end if;

  if not exists (
    select 1
    from public.grade_subjects gs
    join public.subjects s on s.id = gs.subject_id
    where gs.grade_level_id = v_grade_level_id
      and gs.subject_id = new.subject_id
      and gs.active = true
      and s.active = true
      and s.kind = 'quantitative'
  ) then
    raise exception 'La asignatura no está habilitada como cuantitativa para este grado.';
  end if;

  if new.teacher_assignment_id is not null
     and not exists (
       select 1
       from public.teacher_assignments ta
       join public.interdisciplinary_projects p on p.id = new.project_id
       where ta.id = new.teacher_assignment_id
         and ta.academic_year_id = p.academic_year_id
         and ta.course_id = p.course_id
         and ta.subject_id = new.subject_id
         and ta.active = true
     ) then
    raise exception 'La asignación docente no corresponde al curso y asignatura del proyecto.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_project_subject
before insert or update of project_id, subject_id, teacher_assignment_id
on public.project_subjects
for each row execute function public.validate_project_subject();

create or replace function public.validate_project_enrollment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_course uuid;
  v_project_year uuid;
  v_enrollment_course uuid;
  v_enrollment_year uuid;
begin
  if tg_table_name = 'project_student_components' then
    select p.course_id, p.academic_year_id
      into v_project_course, v_project_year
    from public.interdisciplinary_projects p
    where p.id = new.project_id;
  else
    select p.course_id, p.academic_year_id
      into v_project_course, v_project_year
    from public.project_indicators pi
    join public.project_subjects ps on ps.id = pi.project_subject_id
    join public.interdisciplinary_projects p on p.id = ps.project_id
    where pi.id = new.indicator_id;
  end if;

  select e.course_id, e.academic_year_id
    into v_enrollment_course, v_enrollment_year
  from public.enrollments e
  where e.id = new.enrollment_id;

  if v_project_course is null or v_enrollment_course is null then
    raise exception 'No fue posible validar proyecto y matrícula.';
  end if;

  if v_project_course <> v_enrollment_course
     or v_project_year <> v_enrollment_year then
    raise exception 'El estudiante no pertenece al curso/año del proyecto.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_project_indicator_enrollment
before insert or update of indicator_id, enrollment_id
on public.project_indicator_scores
for each row execute function public.validate_project_enrollment();

create trigger trg_validate_project_component_enrollment
before insert or update of project_id, enrollment_id
on public.project_student_components
for each row execute function public.validate_project_enrollment();

-- ---------------------------------------------------------------------
-- 6. EVALUACIONES ORDINARIAS
-- ---------------------------------------------------------------------

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_assignment_id uuid references public.teacher_assignments(id) on delete set null,
  activity_type_id uuid references public.assessment_activity_types(id) on delete set null,
  title text not null,
  category public.assessment_category not null,
  assessment_date date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessments_context_idx
  on public.assessments (academic_year_id, term_id, course_id, subject_id, category);

create trigger trg_assessments_updated_at
before update on public.assessments
for each row execute function public.set_updated_at();

create or replace function public.validate_assessment_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_term_year uuid;
  v_course_year uuid;
  v_grade_level_id uuid;
begin
  select academic_year_id
    into v_term_year
  from public.terms
  where id = new.term_id;

  select academic_year_id, grade_level_id
    into v_course_year, v_grade_level_id
  from public.courses
  where id = new.course_id;

  if v_term_year is null or v_course_year is null then
    raise exception 'El trimestre o el curso seleccionado no existe.';
  end if;

  if v_term_year <> new.academic_year_id
     or v_course_year <> new.academic_year_id then
    raise exception 'Evaluación, trimestre y curso deben pertenecer al mismo año lectivo.';
  end if;

  if not exists (
    select 1
    from public.grade_subjects gs
    join public.subjects s on s.id = gs.subject_id
    where gs.grade_level_id = v_grade_level_id
      and gs.subject_id = new.subject_id
      and gs.active = true
      and s.active = true
      and s.kind = 'quantitative'
  ) then
    raise exception 'La asignatura no está habilitada como cuantitativa para este grado.';
  end if;

  if new.teacher_assignment_id is not null
     and not exists (
       select 1
       from public.teacher_assignments ta
       where ta.id = new.teacher_assignment_id
         and ta.academic_year_id = new.academic_year_id
         and ta.course_id = new.course_id
         and ta.subject_id = new.subject_id
         and ta.active = true
     ) then
    raise exception 'La asignación docente no corresponde a esta evaluación.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_assessment_context
before insert or update of academic_year_id, term_id, course_id, subject_id, teacher_assignment_id
on public.assessments
for each row execute function public.validate_assessment_context();

-- ---------------------------------------------------------------------
-- 7. CALIFICACIONES + MEJORA
-- ---------------------------------------------------------------------

create table public.assessment_grades (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,

  -- Nota obtenida originalmente.
  initial_score numeric(4,2),

  -- Mejora directa: promedio inicial + evaluación de mejora.
  direct_improvement_score numeric(4,2),

  -- Mejora con refuerzo: refuerzo + evaluación posterior de mejora.
  reinforcement_score numeric(4,2),
  reinforced_improvement_score numeric(4,2),

  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assessment_grades_unique unique (assessment_id, enrollment_id),

  constraint assessment_initial_scale_chk
    check (initial_score is null or initial_score between 1.00 and 10.00),
  constraint assessment_direct_scale_chk
    check (direct_improvement_score is null or direct_improvement_score between 1.00 and 10.00),
  constraint assessment_reinforcement_scale_chk
    check (reinforcement_score is null or reinforcement_score between 1.00 and 10.00),
  constraint assessment_reinforced_improvement_scale_chk
    check (reinforced_improvement_score is null or reinforced_improvement_score between 1.00 and 10.00),

  constraint assessment_improvement_modes_chk
    check (
      direct_improvement_score is null
      or (
        reinforcement_score is null
        and reinforced_improvement_score is null
      )
    ),

  constraint reinforced_improvement_requires_reinforcement_chk
    check (
      reinforced_improvement_score is null
      or reinforcement_score is not null
    )
);

create index assessment_grades_enrollment_idx
  on public.assessment_grades (enrollment_id);

create trigger trg_assessment_grades_updated_at
before update on public.assessment_grades
for each row execute function public.set_updated_at();

-- Matrícula y evaluación deben coincidir en año/curso.
create or replace function public.validate_assessment_grade_context()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_assessment_course uuid;
  v_assessment_year uuid;
  v_enrollment_course uuid;
  v_enrollment_year uuid;
begin
  select a.course_id, a.academic_year_id
    into v_assessment_course, v_assessment_year
  from public.assessments a
  where a.id = new.assessment_id;

  select e.course_id, e.academic_year_id
    into v_enrollment_course, v_enrollment_year
  from public.enrollments e
  where e.id = new.enrollment_id;

  if v_assessment_course is null or v_enrollment_course is null then
    raise exception 'No fue posible validar la evaluación y la matrícula.';
  end if;

  if v_assessment_course <> v_enrollment_course
     or v_assessment_year <> v_enrollment_year then
    raise exception 'La evaluación no corresponde al curso/año del estudiante.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_assessment_grade_context
before insert or update of assessment_id, enrollment_id
on public.assessment_grades
for each row execute function public.validate_assessment_grade_context();

-- Reglas normativas de mejora para evaluaciones sumativas.
create or replace function public.validate_grade_improvement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_category public.assessment_category;
  v_subject_id uuid;
  v_year_id uuid;
  v_direct_subject_count integer;
  v_direct_year_count integer;
  v_reinforced_subject_count integer;
  v_reinforced_year_count integer;
begin
  select a.category, a.subject_id, a.academic_year_id
    into v_category, v_subject_id, v_year_id
  from public.assessments a
  where a.id = new.assessment_id;

  if new.direct_improvement_score is not null
     or new.reinforcement_score is not null
     or new.reinforced_improvement_score is not null then

    if new.initial_score is null then
      raise exception 'Debe existir una calificación inicial antes de registrar una mejora.';
    end if;

    if v_category <> 'summative' then
      raise exception 'Este motor aplica la mejora reglada únicamente a evaluaciones sumativas.';
    end if;
  end if;

  -- Mejora directa: calificación inicial superior a 7,00 e inferior a 9,00.
  if new.direct_improvement_score is not null then
    if not (new.initial_score > 7.00 and new.initial_score < 9.00) then
      raise exception 'La mejora directa requiere una calificación inicial superior a 7,00 e inferior a 9,00.';
    end if;

    select count(*)
      into v_direct_subject_count
    from public.assessment_grades ag
    join public.assessments a on a.id = ag.assessment_id
    where ag.enrollment_id = new.enrollment_id
      and a.academic_year_id = v_year_id
      and a.subject_id = v_subject_id
      and ag.direct_improvement_score is not null
      and ag.id <> new.id;

    if v_direct_subject_count >= 1 then
      raise exception 'El estudiante ya utilizó la mejora directa permitida en esta asignatura durante el año lectivo.';
    end if;

    select count(*)
      into v_direct_year_count
    from public.assessment_grades ag
    join public.assessments a on a.id = ag.assessment_id
    where ag.enrollment_id = new.enrollment_id
      and a.academic_year_id = v_year_id
      and ag.direct_improvement_score is not null
      and ag.id <> new.id;

    if v_direct_year_count >= 3 then
      raise exception 'El estudiante ya alcanzó el máximo anual de tres evaluaciones sumativas con mejora directa.';
    end if;
  end if;

  -- Mejora con refuerzo: calificación inicial entre 1,00 y 6,99.
  if new.reinforcement_score is not null
     or new.reinforced_improvement_score is not null then

    if not (new.initial_score between 1.00 and 6.99) then
      raise exception 'La mejora con refuerzo requiere una calificación inicial entre 1,00 y 6,99.';
    end if;

    select count(*)
      into v_reinforced_subject_count
    from public.assessment_grades ag
    join public.assessments a on a.id = ag.assessment_id
    where ag.enrollment_id = new.enrollment_id
      and a.academic_year_id = v_year_id
      and a.subject_id = v_subject_id
      and (
        ag.reinforcement_score is not null
        or ag.reinforced_improvement_score is not null
      )
      and ag.id <> new.id;

    if v_reinforced_subject_count >= 2 then
      raise exception 'El estudiante ya alcanzó el máximo de dos evaluaciones sumativas con refuerzo en esta asignatura.';
    end if;

    select count(*)
      into v_reinforced_year_count
    from public.assessment_grades ag
    join public.assessments a on a.id = ag.assessment_id
    where ag.enrollment_id = new.enrollment_id
      and a.academic_year_id = v_year_id
      and (
        ag.reinforcement_score is not null
        or ag.reinforced_improvement_score is not null
      )
      and ag.id <> new.id;

    if v_reinforced_year_count >= 6 then
      raise exception 'El estudiante ya alcanzó el máximo anual de seis evaluaciones sumativas con refuerzo.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validate_grade_improvement
before insert or update of
  assessment_id,
  enrollment_id,
  initial_score,
  direct_improvement_score,
  reinforcement_score,
  reinforced_improvement_score
on public.assessment_grades
for each row execute function public.validate_grade_improvement();

-- Nota efectiva de una evaluación.
create or replace function public.effective_assessment_score(
  p_initial numeric,
  p_direct numeric,
  p_reinforcement numeric,
  p_reinforced_improvement numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_initial is null then null

    when p_reinforcement is not null
         and p_reinforced_improvement is not null
      then greatest(
        p_initial,
        trunc(
          (p_initial + p_reinforcement + p_reinforced_improvement) / 3.0,
          2
        )
      )

    when p_direct is not null
      then greatest(
        p_initial,
        trunc((p_initial + p_direct) / 2.0, 2)
      )

    else p_initial
  end;
$$;

-- ---------------------------------------------------------------------
-- 8. AUDITORÍA DE CALIFICACIONES
-- ---------------------------------------------------------------------

create table public.grade_audit_log (
  id bigserial primary key,
  grade_id uuid,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function public.audit_assessment_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.grade_audit_log (
      grade_id, operation, old_data, new_data, changed_by
    )
    values (
      new.id, tg_op, null, to_jsonb(new), auth.uid()
    );
    return new;

  elsif tg_op = 'UPDATE' then
    insert into public.grade_audit_log (
      grade_id, operation, old_data, new_data, changed_by
    )
    values (
      new.id, tg_op, to_jsonb(old), to_jsonb(new), auth.uid()
    );
    return new;

  else
    insert into public.grade_audit_log (
      grade_id, operation, old_data, new_data, changed_by
    )
    values (
      old.id, tg_op, to_jsonb(old), null, auth.uid()
    );
    return old;
  end if;
end;
$$;

create trigger trg_audit_assessment_grade
after insert or update or delete
on public.assessment_grades
for each row execute function public.audit_assessment_grade();

-- ---------------------------------------------------------------------
-- 9. VISTAS DE PROYECTO
-- ---------------------------------------------------------------------

create or replace view public.v_project_subject_scores
with (security_invoker = true)
as
with project_students as (
  select
    ps.id as project_subject_id,
    ps.project_id,
    ps.subject_id,
    p.academic_year_id,
    p.term_id,
    p.course_id,
    e.id as enrollment_id
  from public.project_subjects ps
  join public.interdisciplinary_projects p
    on p.id = ps.project_id
  join public.enrollments e
    on e.course_id = p.course_id
   and e.academic_year_id = p.academic_year_id
   and e.status in ('active', 'completed')
  where ps.active = true
),
indicator_summary as (
  select
    b.project_subject_id,
    b.project_id,
    b.subject_id,
    b.academic_year_id,
    b.term_id,
    b.course_id,
    b.enrollment_id,
    count(pi.id) filter (where pi.active = true) as expected_indicators,
    count(pis.score) filter (
      where pi.active = true
        and pis.score is not null
    ) as graded_indicators,
    trunc(
      avg(pis.score) filter (
        where pi.active = true
          and pis.score is not null
      ),
      2
    ) as indicator_average
  from project_students b
  left join public.project_indicators pi
    on pi.project_subject_id = b.project_subject_id
   and pi.active = true
  left join public.project_indicator_scores pis
    on pis.indicator_id = pi.id
   and pis.enrollment_id = b.enrollment_id
  group by
    b.project_subject_id,
    b.project_id,
    b.subject_id,
    b.academic_year_id,
    b.term_id,
    b.course_id,
    b.enrollment_id
)
select
  s.project_subject_id,
  s.project_id,
  s.academic_year_id,
  s.term_id,
  s.course_id,
  s.subject_id,
  s.enrollment_id,
  s.expected_indicators,
  s.graded_indicators,
  s.indicator_average,
  c.product_score,
  c.presentation_score,
  case
    when s.expected_indicators > 0
     and s.graded_indicators = s.expected_indicators
     and s.indicator_average is not null
     and c.product_score is not null
     and c.presentation_score is not null
    then trunc(
      (s.indicator_average + c.product_score + c.presentation_score) / 3.0,
      2
    )
    else null
  end as project_score
from indicator_summary s
left join public.project_student_components c
  on c.project_id = s.project_id
 and c.enrollment_id = s.enrollment_id;

-- ---------------------------------------------------------------------
-- 10. VISTAS DE NOTAS EFECTIVAS
-- ---------------------------------------------------------------------

create or replace view public.v_assessment_effective_grades
with (security_invoker = true)
as
select
  ag.id as grade_id,
  ag.assessment_id,
  ag.enrollment_id,
  a.academic_year_id,
  a.term_id,
  a.course_id,
  a.subject_id,
  a.category,
  a.title,
  ag.initial_score,
  ag.direct_improvement_score,
  ag.reinforcement_score,
  ag.reinforced_improvement_score,
  public.effective_assessment_score(
    ag.initial_score,
    ag.direct_improvement_score,
    ag.reinforcement_score,
    ag.reinforced_improvement_score
  ) as effective_score
from public.assessment_grades ag
join public.assessments a on a.id = ag.assessment_id
where a.active = true;

-- Unifica aportes ordinarios y proyectos.
create or replace view public.v_evaluation_score_items
with (security_invoker = true)
as
select
  'assessment'::text as source_type,
  g.assessment_id as source_id,
  g.enrollment_id,
  g.academic_year_id,
  g.term_id,
  g.course_id,
  g.subject_id,
  g.category,
  g.title,
  g.effective_score
from public.v_assessment_effective_grades g
where g.effective_score is not null

union all

select
  'project'::text as source_type,
  p.project_subject_id as source_id,
  p.enrollment_id,
  p.academic_year_id,
  p.term_id,
  p.course_id,
  p.subject_id,
  'summative'::public.assessment_category as category,
  ip.name as title,
  p.project_score as effective_score
from public.v_project_subject_scores p
join public.interdisciplinary_projects ip on ip.id = p.project_id
where p.project_score is not null
  and ip.status <> 'draft';

-- ---------------------------------------------------------------------
-- 11. RESULTADO POR ASIGNATURA Y TRIMESTRE
-- ---------------------------------------------------------------------

create or replace view public.v_subject_term_results
with (security_invoker = true)
as
with base as (
  select
    e.id as enrollment_id,
    e.student_id,
    e.academic_year_id,
    e.course_id,
    c.grade_level_id,
    gl.sublevel,
    gl.evaluation_model,
    gs.subject_id,
    t.id as term_id,
    t.number as term_number
  from public.enrollments e
  join public.courses c
    on c.id = e.course_id
  join public.grade_levels gl
    on gl.id = c.grade_level_id
  join public.grade_subjects gs
    on gs.grade_level_id = c.grade_level_id
   and gs.active = true
  join public.subjects s
    on s.id = gs.subject_id
   and s.active = true
   and s.kind = 'quantitative'
  join public.terms t
    on t.academic_year_id = e.academic_year_id
  where e.status in ('active', 'completed')
),
agg as (
  select
    b.*,
    count(i.effective_score)
      filter (where i.effective_score is not null) as total_items,

    count(i.effective_score)
      filter (where i.category = 'formative') as formative_items,

    count(i.effective_score)
      filter (where i.category = 'summative') as summative_items,

    round(
      avg(i.effective_score)
        filter (where i.effective_score is not null),
      6
    ) as simple_average_raw,

    round(
      avg(i.effective_score)
        filter (where i.category = 'formative'),
      6
    ) as formative_average_raw,

    round(
      avg(i.effective_score)
        filter (where i.category = 'summative'),
      6
    ) as summative_average_raw

  from base b
  left join public.v_evaluation_score_items i
    on i.enrollment_id = b.enrollment_id
   and i.term_id = b.term_id
   and i.subject_id = b.subject_id
  group by
    b.enrollment_id,
    b.student_id,
    b.academic_year_id,
    b.course_id,
    b.grade_level_id,
    b.sublevel,
    b.evaluation_model,
    b.subject_id,
    b.term_id,
    b.term_number
)
select
  a.enrollment_id,
  a.student_id,
  a.academic_year_id,
  a.course_id,
  a.grade_level_id,
  a.sublevel,
  a.evaluation_model,
  a.subject_id,
  a.term_id,
  a.term_number,
  a.total_items,
  a.formative_items,
  a.summative_items,

  case
    when a.formative_items > 0
      then trunc(a.formative_average_raw, 2)
    else null
  end as formative_average,

  case
    when a.summative_items > 0
      then trunc(a.summative_average_raw, 2)
    else null
  end as summative_average,

  case
    when a.evaluation_model = 'simple_average'
         and a.total_items > 0
      then round(a.simple_average_raw, 2)

    when a.evaluation_model = 'weighted_70_30'
         and a.formative_items > 0
         and a.summative_items > 0
      then trunc(
        (trunc(a.formative_average_raw, 2) * 0.70)
        +
        (trunc(a.summative_average_raw, 2) * 0.30),
        2
      )

    else null
  end as term_score,

  public.qualitative_letter(
    case
      when a.evaluation_model = 'simple_average'
           and a.total_items > 0
        then round(a.simple_average_raw, 2)

      when a.evaluation_model = 'weighted_70_30'
           and a.formative_items > 0
           and a.summative_items > 0
        then trunc(
          (trunc(a.formative_average_raw, 2) * 0.70)
          +
          (trunc(a.summative_average_raw, 2) * 0.30),
          2
        )

      else null
    end
  ) as qualitative

from agg a;

-- ---------------------------------------------------------------------
-- 12. RESULTADO ANUAL POR ASIGNATURA
-- ---------------------------------------------------------------------

create or replace view public.v_subject_annual_results
with (security_invoker = true)
as
with pivoted as (
  select
    r.enrollment_id,
    r.student_id,
    r.academic_year_id,
    r.course_id,
    r.grade_level_id,
    r.sublevel,
    r.evaluation_model,
    r.subject_id,
    max(r.term_score) filter (where r.term_number = 1) as term_1,
    max(r.term_score) filter (where r.term_number = 2) as term_2,
    max(r.term_score) filter (where r.term_number = 3) as term_3,
    count(r.term_score) as completed_terms
  from public.v_subject_term_results r
  group by
    r.enrollment_id,
    r.student_id,
    r.academic_year_id,
    r.course_id,
    r.grade_level_id,
    r.sublevel,
    r.evaluation_model,
    r.subject_id
)
select
  p.*,
  case
    when p.completed_terms = 3
     and p.evaluation_model = 'simple_average'
      then round((p.term_1 + p.term_2 + p.term_3) / 3.0, 2)

    when p.completed_terms = 3
     and p.evaluation_model = 'weighted_70_30'
      then trunc((p.term_1 + p.term_2 + p.term_3) / 3.0, 2)

    else null
  end as annual_score,

  public.qualitative_letter(
    case
      when p.completed_terms = 3
       and p.evaluation_model = 'simple_average'
        then round((p.term_1 + p.term_2 + p.term_3) / 3.0, 2)

      when p.completed_terms = 3
       and p.evaluation_model = 'weighted_70_30'
        then trunc((p.term_1 + p.term_2 + p.term_3) / 3.0, 2)

      else null
    end
  ) as qualitative

from pivoted p;

-- ---------------------------------------------------------------------
-- 13. SUPLETORIO: REGISTRO + ELEGIBILIDAD
-- ---------------------------------------------------------------------

create table public.supplementary_exams (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  exam_score numeric(4,2),
  exam_date date,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplementary_exams_unique unique (enrollment_id, subject_id),
  constraint supplementary_exam_scale_chk
    check (exam_score is null or exam_score between 1.00 and 10.00)
);

create trigger trg_supplementary_exams_updated_at
before update on public.supplementary_exams
for each row execute function public.set_updated_at();

create or replace view public.v_supplementary_eligibility
with (security_invoker = true)
as
select
  r.enrollment_id,
  r.student_id,
  r.academic_year_id,
  r.course_id,
  r.grade_level_id,
  r.subject_id,
  r.annual_score,
  case
    when r.sublevel = 'media'
     and r.annual_score between 4.01 and 6.99
      then true
    else false
  end as eligible,
  se.exam_score,
  se.exam_date
from public.v_subject_annual_results r
left join public.supplementary_exams se
  on se.enrollment_id = r.enrollment_id
 and se.subject_id = r.subject_id;

create or replace function public.validate_supplementary_exam()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_eligible boolean;
begin
  select e.eligible
    into v_eligible
  from public.v_supplementary_eligibility e
  where e.enrollment_id = new.enrollment_id
    and e.subject_id = new.subject_id;

  if coalesce(v_eligible, false) = false then
    raise exception 'El estudiante/asignatura no se encuentra habilitado para evaluación supletoria.';
  end if;

  return new;
end;
$$;

create trigger trg_validate_supplementary_exam
before insert or update of enrollment_id, subject_id
on public.supplementary_exams
for each row execute function public.validate_supplementary_exam();

-- ---------------------------------------------------------------------
-- 14. FUNCIONES DE AUTORIZACIÓN DOCENTE
-- ---------------------------------------------------------------------

create or replace function public.teacher_can_manage_subject(
  p_academic_year_id uuid,
  p_course_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    join public.teacher_assignments ta on ta.teacher_id = t.id
    where t.profile_id = auth.uid()
      and t.active = true
      and ta.active = true
      and ta.academic_year_id = p_academic_year_id
      and ta.course_id = p_course_id
      and ta.subject_id = p_subject_id
  );
$$;

create or replace function public.teacher_can_manage_assessment(
  p_assessment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessments a
    where a.id = p_assessment_id
      and public.teacher_can_manage_subject(
        a.academic_year_id,
        a.course_id,
        a.subject_id
      )
  );
$$;

create or replace function public.teacher_can_manage_project_subject(
  p_project_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_subjects ps
    join public.interdisciplinary_projects p on p.id = ps.project_id
    where ps.id = p_project_subject_id
      and public.teacher_can_manage_subject(
        p.academic_year_id,
        p.course_id,
        ps.subject_id
      )
  );
$$;

create or replace function public.teacher_can_manage_project(
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_subjects ps
    where ps.project_id = p_project_id
      and public.teacher_can_manage_project_subject(ps.id)
  );
$$;

-- ---------------------------------------------------------------------
-- 15. RLS
-- ---------------------------------------------------------------------

alter table public.assessment_activity_types enable row level security;
alter table public.interdisciplinary_projects enable row level security;
alter table public.project_subjects enable row level security;
alter table public.project_indicators enable row level security;
alter table public.project_indicator_scores enable row level security;
alter table public.project_student_components enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_grades enable row level security;
alter table public.grade_audit_log enable row level security;
alter table public.supplementary_exams enable row level security;

-- Lectura para usuarios activos.
create policy "active users read activity types"
on public.assessment_activity_types
for select to authenticated
using (public.current_profile_active());

create policy "active users read projects"
on public.interdisciplinary_projects
for select to authenticated
using (public.current_profile_active());

create policy "active users read project subjects"
on public.project_subjects
for select to authenticated
using (public.current_profile_active());

create policy "active users read project indicators"
on public.project_indicators
for select to authenticated
using (public.current_profile_active());

create policy "active users read project indicator scores"
on public.project_indicator_scores
for select to authenticated
using (public.current_profile_active());

create policy "active users read project components"
on public.project_student_components
for select to authenticated
using (public.current_profile_active());

create policy "active users read assessments"
on public.assessments
for select to authenticated
using (public.current_profile_active());

create policy "active users read assessment grades"
on public.assessment_grades
for select to authenticated
using (public.current_profile_active());

create policy "director reads grade audit"
on public.grade_audit_log
for select to authenticated
using (public.is_director());

create policy "active users read supplementary exams"
on public.supplementary_exams
for select to authenticated
using (public.current_profile_active());

-- Director administra todo el motor.
create policy "director manages activity types"
on public.assessment_activity_types
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages projects"
on public.interdisciplinary_projects
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages project subjects"
on public.project_subjects
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages project indicators"
on public.project_indicators
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages project indicator scores"
on public.project_indicator_scores
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages project components"
on public.project_student_components
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages assessments"
on public.assessments
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages assessment grades"
on public.assessment_grades
for all to authenticated
using (public.is_director())
with check (public.is_director());

create policy "director manages supplementary exams"
on public.supplementary_exams
for all to authenticated
using (public.is_director())
with check (public.is_director());

-- Docente: evaluaciones de sus propias asignaciones.
create policy "teacher inserts assigned assessments"
on public.assessments
for insert to authenticated
with check (
  public.current_profile_active()
  and public.teacher_can_manage_subject(
    academic_year_id,
    course_id,
    subject_id
  )
);

create policy "teacher updates assigned assessments"
on public.assessments
for update to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_subject(
    academic_year_id,
    course_id,
    subject_id
  )
)
with check (
  public.current_profile_active()
  and public.teacher_can_manage_subject(
    academic_year_id,
    course_id,
    subject_id
  )
);

create policy "teacher deletes assigned assessments"
on public.assessments
for delete to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_subject(
    academic_year_id,
    course_id,
    subject_id
  )
);

create policy "teacher inserts assigned grades"
on public.assessment_grades
for insert to authenticated
with check (
  public.current_profile_active()
  and public.teacher_can_manage_assessment(assessment_id)
);

create policy "teacher updates assigned grades"
on public.assessment_grades
for update to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_assessment(assessment_id)
)
with check (
  public.current_profile_active()
  and public.teacher_can_manage_assessment(assessment_id)
);

create policy "teacher deletes assigned grades"
on public.assessment_grades
for delete to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_assessment(assessment_id)
);

-- Docente: indicadores y notas del proyecto de sus materias.
create policy "teacher inserts project indicators"
on public.project_indicators
for insert to authenticated
with check (
  public.current_profile_active()
  and public.teacher_can_manage_project_subject(project_subject_id)
);

create policy "teacher updates project indicators"
on public.project_indicators
for update to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_project_subject(project_subject_id)
)
with check (
  public.current_profile_active()
  and public.teacher_can_manage_project_subject(project_subject_id)
);

create policy "teacher deletes project indicators"
on public.project_indicators
for delete to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_project_subject(project_subject_id)
);

create policy "teacher inserts project indicator scores"
on public.project_indicator_scores
for insert to authenticated
with check (
  public.current_profile_active()
  and exists (
    select 1
    from public.project_indicators pi
    where pi.id = indicator_id
      and public.teacher_can_manage_project_subject(pi.project_subject_id)
  )
);

create policy "teacher updates project indicator scores"
on public.project_indicator_scores
for update to authenticated
using (
  public.current_profile_active()
  and exists (
    select 1
    from public.project_indicators pi
    where pi.id = indicator_id
      and public.teacher_can_manage_project_subject(pi.project_subject_id)
  )
)
with check (
  public.current_profile_active()
  and exists (
    select 1
    from public.project_indicators pi
    where pi.id = indicator_id
      and public.teacher_can_manage_project_subject(pi.project_subject_id)
  )
);

create policy "teacher manages project components"
on public.project_student_components
for all to authenticated
using (
  public.current_profile_active()
  and public.teacher_can_manage_project(project_id)
)
with check (
  public.current_profile_active()
  and public.teacher_can_manage_project(project_id)
);

-- El supletorio queda administrado por dirección en esta fase.
-- Más adelante podrá delegarse mediante una política institucional.

-- ---------------------------------------------------------------------
-- 16. PRIVILEGIOS POSTGREST
-- ---------------------------------------------------------------------

grant select, insert, update, delete
on public.assessment_activity_types,
   public.interdisciplinary_projects,
   public.project_subjects,
   public.project_indicators,
   public.project_indicator_scores,
   public.project_student_components,
   public.assessments,
   public.assessment_grades,
   public.supplementary_exams
to authenticated;

grant select
on public.grade_audit_log
to authenticated;

grant select
on public.v_project_subject_scores,
   public.v_assessment_effective_grades,
   public.v_evaluation_score_items,
   public.v_subject_term_results,
   public.v_subject_annual_results,
   public.v_supplementary_eligibility
to authenticated;

grant usage, select
on sequence public.grade_audit_log_id_seq
to authenticated;

grant execute
on function public.trunc2(numeric),
            public.round2(numeric),
            public.qualitative_letter(numeric),
            public.effective_assessment_score(numeric,numeric,numeric,numeric),
            public.teacher_can_manage_subject(uuid,uuid,uuid),
            public.teacher_can_manage_assessment(uuid),
            public.teacher_can_manage_project_subject(uuid),
            public.teacher_can_manage_project(uuid)
to authenticated;

commit;
