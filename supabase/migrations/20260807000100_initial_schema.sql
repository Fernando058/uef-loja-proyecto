-- UEF Loja - esquema académico inicial
-- Aplicar con: npx supabase db push

create extension if not exists pgcrypto;

create type public.app_role as enum ('director', 'teacher');
create type public.enrollment_status as enum ('active', 'withdrawn', 'transferred', 'completed');
create type public.grade_status as enum ('graded', 'pending', 'absent', 'not_submitted', 'not_applicable');

create table public.institution_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Unidad Educativa Fiscal Loja',
  amie_code text,
  district text,
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.institution_settings (id) values (1)
on conflict (id) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_names text not null default '',
  last_names text not null default '',
  role public.app_role not null default 'teacher',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  first_names text not null,
  last_names text not null,
  national_id text unique,
  birth_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  first_names text not null,
  last_names text not null,
  national_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  active boolean not null default false,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

create unique index only_one_active_academic_year
  on public.academic_years (active)
  where active = true;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null,
  order_no smallint not null check (order_no between 1 and 3),
  starts_on date,
  ends_on date,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, order_no),
  unique (academic_year_id, name)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  grade_level text not null,
  parallel text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, grade_level, parallel)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  status public.enrollment_status not null default 'active',
  enrolled_on date not null default current_date,
  withdrawn_on date,
  withdrawal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, course_id, subject_id)
);

create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  teacher_assignment_id uuid not null references public.teacher_assignments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  assessment_type_id uuid references public.assessment_types(id) on delete set null,
  code text,
  title text not null,
  assessment_date date,
  max_score numeric(4,2) not null default 10 check (max_score > 0 and max_score <= 10),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  score numeric(4,2) check (score is null or (score >= 0 and score <= 10)),
  status public.grade_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (assessment_id, enrollment_id),
  check ((status = 'graded' and score is not null) or status <> 'graded')
);

create table public.summative_records (
  id uuid primary key default gen_random_uuid(),
  teacher_assignment_id uuid not null references public.teacher_assignments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  project_score numeric(4,2) check (project_score is null or project_score between 0 and 10),
  initial_score numeric(4,2) check (initial_score is null or initial_score between 0 and 10),
  improvement_score numeric(4,2) check (improvement_score is null or improvement_score between 0 and 10),
  reinforcement_score numeric(4,2) check (reinforcement_score is null or reinforcement_score between 0 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (teacher_assignment_id, term_id, enrollment_id)
);

create table public.behavior_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  letter text not null check (letter in ('A', 'B', 'C', 'D', 'E')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (enrollment_id, term_id)
);

create table public.recovery_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  teacher_assignment_id uuid not null references public.teacher_assignments(id) on delete cascade,
  score numeric(4,2) not null check (score between 0 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (enrollment_id, teacher_assignment_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  user_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index students_name_idx on public.students (last_names, first_names);
create index teachers_user_idx on public.teachers (user_id);
create index enrollments_course_idx on public.enrollments (academic_year_id, course_id, status);
create index teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id, active);
create index assessments_assignment_term_idx on public.assessments (teacher_assignment_id, term_id, active);
create index grades_enrollment_idx on public.grades (enrollment_id);
create index summative_assignment_term_idx on public.summative_records (teacher_assignment_id, term_id);
create index behavior_term_idx on public.behavior_records (term_id, course_id);


create or replace function public.validate_academic_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  course_year uuid;
  assignment_year uuid;
  assignment_course uuid;
  term_year uuid;
  enrollment_year uuid;
  enrollment_course uuid;
begin
  if tg_table_name = 'enrollments' then
    select academic_year_id into course_year from public.courses where id = new.course_id;
    if course_year is distinct from new.academic_year_id then
      raise exception 'El curso no pertenece al año lectivo de la matrícula.';
    end if;

  elsif tg_table_name = 'teacher_assignments' then
    select academic_year_id into course_year from public.courses where id = new.course_id;
    if course_year is distinct from new.academic_year_id then
      raise exception 'El curso no pertenece al año lectivo de la asignación.';
    end if;

  elsif tg_table_name = 'assessments' then
    select academic_year_id into assignment_year from public.teacher_assignments where id = new.teacher_assignment_id;
    select academic_year_id into term_year from public.terms where id = new.term_id;
    if assignment_year is distinct from term_year then
      raise exception 'El trimestre no pertenece al año lectivo de la asignación.';
    end if;

  elsif tg_table_name = 'grades' then
    select ta.academic_year_id, ta.course_id
      into assignment_year, assignment_course
    from public.assessments a
    join public.teacher_assignments ta on ta.id = a.teacher_assignment_id
    where a.id = new.assessment_id;

    select academic_year_id, course_id
      into enrollment_year, enrollment_course
    from public.enrollments
    where id = new.enrollment_id;

    if assignment_year is distinct from enrollment_year
       or assignment_course is distinct from enrollment_course then
      raise exception 'La calificación no corresponde al curso y año de la matrícula.';
    end if;

  elsif tg_table_name = 'summative_records' then
    select academic_year_id, course_id
      into assignment_year, assignment_course
    from public.teacher_assignments
    where id = new.teacher_assignment_id;

    select academic_year_id into term_year from public.terms where id = new.term_id;
    select academic_year_id, course_id
      into enrollment_year, enrollment_course
    from public.enrollments
    where id = new.enrollment_id;

    if assignment_year is distinct from term_year
       or assignment_year is distinct from enrollment_year
       or assignment_course is distinct from enrollment_course then
      raise exception 'El registro sumativo no corresponde al mismo curso, año y trimestre.';
    end if;

  elsif tg_table_name = 'behavior_records' then
    select academic_year_id, course_id
      into enrollment_year, enrollment_course
    from public.enrollments
    where id = new.enrollment_id;
    select academic_year_id into term_year from public.terms where id = new.term_id;

    if new.course_id is distinct from enrollment_course
       or term_year is distinct from enrollment_year then
      raise exception 'El comportamiento no corresponde al curso y trimestre de la matrícula.';
    end if;

  elsif tg_table_name = 'recovery_records' then
    select academic_year_id, course_id
      into assignment_year, assignment_course
    from public.teacher_assignments
    where id = new.teacher_assignment_id;
    select academic_year_id, course_id
      into enrollment_year, enrollment_course
    from public.enrollments
    where id = new.enrollment_id;

    if assignment_year is distinct from enrollment_year
       or assignment_course is distinct from enrollment_course then
      raise exception 'La recuperación no corresponde al curso y año de la matrícula.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_enrollment_context before insert or update on public.enrollments for each row execute function public.validate_academic_context();
create trigger validate_assignment_context before insert or update on public.teacher_assignments for each row execute function public.validate_academic_context();
create trigger validate_assessment_context before insert or update on public.assessments for each row execute function public.validate_academic_context();
create trigger validate_grade_context before insert or update on public.grades for each row execute function public.validate_academic_context();
create trigger validate_summative_context before insert or update on public.summative_records for each row execute function public.validate_academic_context();
create trigger validate_behavior_context before insert or update on public.behavior_records for each row execute function public.validate_academic_context();
create trigger validate_recovery_context before insert or update on public.recovery_records for each row execute function public.validate_academic_context();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger institution_settings_updated_at before update on public.institution_settings for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger students_updated_at before update on public.students for each row execute function public.set_updated_at();
create trigger teachers_updated_at before update on public.teachers for each row execute function public.set_updated_at();
create trigger academic_years_updated_at before update on public.academic_years for each row execute function public.set_updated_at();
create trigger terms_updated_at before update on public.terms for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger subjects_updated_at before update on public.subjects for each row execute function public.set_updated_at();
create trigger enrollments_updated_at before update on public.enrollments for each row execute function public.set_updated_at();
create trigger teacher_assignments_updated_at before update on public.teacher_assignments for each row execute function public.set_updated_at();
create trigger assessments_updated_at before update on public.assessments for each row execute function public.set_updated_at();
create trigger grades_updated_at before update on public.grades for each row execute function public.set_updated_at();
create trigger summative_updated_at before update on public.summative_records for each row execute function public.set_updated_at();
create trigger behavior_updated_at before update on public.behavior_records for each row execute function public.set_updated_at();
create trigger recovery_updated_at before update on public.recovery_records for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_names, last_names, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_names', ''),
    coalesce(new.raw_user_meta_data ->> 'last_names', ''),
    'teacher',
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        first_names = excluded.first_names,
        last_names = excluded.last_names;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = (select auth.uid()) and active = true;
$$;

create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'director', false);
$$;

create or replace function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.teachers t
  join public.profiles p on p.id = t.user_id
  where t.user_id = (select auth.uid())
    and t.active = true
    and p.active = true
  limit 1;
$$;

create or replace function public.teacher_can_access_assignment(assignment_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_assignments ta
    where ta.id = assignment_uuid
      and ta.teacher_id = public.current_teacher_id()
      and ta.active = true
  );
$$;

create or replace function public.teacher_can_access_course(course_uuid uuid, year_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_assignments ta
    where ta.course_id = course_uuid
      and ta.academic_year_id = year_uuid
      and ta.teacher_id = public.current_teacher_id()
      and ta.active = true
  );
$$;

create or replace function public.teacher_can_access_enrollment(enrollment_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.id = enrollment_uuid
      and public.teacher_can_access_course(e.course_id, e.academic_year_id)
  );
$$;

create or replace function public.is_term_open(term_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(not t.closed and not ay.closed, false)
  from public.terms t
  join public.academic_years ay on ay.id = t.academic_year_id
  where t.id = term_uuid;
$$;

create or replace function public.is_assignment_year_open(assignment_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(not ay.closed, false)
  from public.teacher_assignments ta
  join public.academic_years ay on ay.id = ta.academic_year_id
  where ta.id = assignment_uuid;
$$;

create or replace function public.alphabetic_scale(score numeric)
returns text
language sql
immutable
as $$
  select case
    when score is null then null
    when trunc(score, 2) >= 9.50 then 'A+'
    when trunc(score, 2) >= 8.50 then 'A-'
    when trunc(score, 2) >= 7.50 then 'B+'
    when trunc(score, 2) >= 6.50 then 'B-'
    when trunc(score, 2) >= 5.50 then 'C+'
    when trunc(score, 2) >= 4.50 then 'C-'
    when trunc(score, 2) >= 3.50 then 'D+'
    when trunc(score, 2) >= 2.50 then 'D-'
    when trunc(score, 2) >= 1.50 then 'E+'
    else 'E-'
  end;
$$;

create or replace function public.learning_scale(score numeric)
returns text
language sql
immutable
as $$
  select case
    when score is null then null
    when trunc(score, 2) >= 9.00 then 'DAR'
    when trunc(score, 2) >= 7.00 then 'AAR'
    when trunc(score, 2) >= 4.01 then 'PAAR'
    else 'NAAR'
  end;
$$;

create or replace function public.staged_summative(
  project_score numeric,
  initial_score numeric,
  improvement_score numeric,
  reinforcement_score numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  base_score numeric;
  direct_score numeric;
  final_score numeric;
  base_count integer;
begin
  base_count := (project_score is not null)::integer + (initial_score is not null)::integer;
  if base_count = 0 then
    base_score := null;
  else
    base_score := (coalesce(project_score, 0) + coalesce(initial_score, 0)) / base_count;
  end if;

  if improvement_score is null then
    direct_score := base_score;
  elsif base_score is null then
    direct_score := improvement_score;
  else
    direct_score := (base_score + improvement_score) / 2;
  end if;

  if reinforcement_score is null then
    final_score := direct_score;
  elsif direct_score is null then
    final_score := reinforcement_score;
  else
    final_score := (direct_score + reinforcement_score) / 2;
  end if;

  return round(final_score, 2);
end;
$$;


create or replace function public.term_final_score(formative_average numeric, summative_final numeric)
returns numeric
language sql
immutable
as $$
  select case
    when formative_average is null and summative_final is null then null
    else round(coalesce(formative_average * 0.70, 0) + coalesce(summative_final * 0.30, 0), 2)
  end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (table_name, record_id, action, user_id, old_data, new_data)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_students after insert or update or delete on public.students for each row execute function public.audit_row_change();
create trigger audit_enrollments after insert or update or delete on public.enrollments for each row execute function public.audit_row_change();
create trigger audit_grades after insert or update or delete on public.grades for each row execute function public.audit_row_change();
create trigger audit_summative after insert or update or delete on public.summative_records for each row execute function public.audit_row_change();
create trigger audit_recovery after insert or update or delete on public.recovery_records for each row execute function public.audit_row_change();

insert into public.assessment_types (code, name) values
  ('TAI', 'Tareas / deberes'),
  ('LO', 'Lección oral'),
  ('LE', 'Lección escrita'),
  ('PE', 'Prueba de base estructurada'),
  ('TA-G', 'Talleres'),
  ('EXPO', 'Exposiciones'),
  ('EXP', 'Experimentos'),
  ('PST', 'Presentaciones artísticas / científicas'),
  ('RP', 'Refuerzo pedagógico'),
  ('INV', 'Investigación'),
  ('PROY', 'Proyectos'),
  ('ENS', 'Ensayo'),
  ('DBT', 'Debates'),
  ('BLG', 'Blogs'),
  ('VID', 'Videos'),
  ('PDC', 'Podcasts')
on conflict (code) do update set name = excluded.name;

insert into public.subjects (name, short_name) values
  ('Matemática', 'MAT'),
  ('Lengua y Literatura', 'LYL'),
  ('Ciencias Naturales', 'CCNN'),
  ('Estudios Sociales', 'EESS'),
  ('Inglés', 'ING'),
  ('Educación Física', 'EF'),
  ('Educación Cultural y Artística', 'ECA')
on conflict (name) do nothing;

-- RLS
alter table public.institution_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;
alter table public.courses enable row level security;
alter table public.subjects enable row level security;
alter table public.enrollments enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.assessment_types enable row level security;
alter table public.assessments enable row level security;
alter table public.grades enable row level security;
alter table public.summative_records enable row level security;
alter table public.behavior_records enable row level security;
alter table public.recovery_records enable row level security;
alter table public.audit_log enable row level security;

create policy institution_select on public.institution_settings for select to authenticated using (true);
create policy institution_director_write on public.institution_settings for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_director()));
create policy profiles_director_write on public.profiles for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy students_select on public.students for select to authenticated using (
  (select public.is_director()) or exists (
    select 1 from public.enrollments e
    where e.student_id = students.id
      and public.teacher_can_access_course(e.course_id, e.academic_year_id)
  )
);
create policy students_director_write on public.students for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy teachers_select on public.teachers for select to authenticated using (
  (select public.is_director()) or user_id = (select auth.uid())
);
create policy teachers_director_write on public.teachers for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy years_select on public.academic_years for select to authenticated using (true);
create policy years_director_write on public.academic_years for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));
create policy terms_select on public.terms for select to authenticated using (true);
create policy terms_director_write on public.terms for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));
create policy courses_select on public.courses for select to authenticated using (true);
create policy courses_director_write on public.courses for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));
create policy subjects_select on public.subjects for select to authenticated using (true);
create policy subjects_director_write on public.subjects for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));
create policy assessment_types_select on public.assessment_types for select to authenticated using (true);
create policy assessment_types_director_write on public.assessment_types for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy enrollments_select on public.enrollments for select to authenticated using (
  (select public.is_director()) or public.teacher_can_access_course(course_id, academic_year_id)
);
create policy enrollments_director_write on public.enrollments for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy assignments_select on public.teacher_assignments for select to authenticated using (
  (select public.is_director()) or teacher_id = public.current_teacher_id()
);
create policy assignments_director_write on public.teacher_assignments for all to authenticated using ((select public.is_director())) with check ((select public.is_director()));

create policy assessments_select on public.assessments for select to authenticated using (
  (select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id)
);
create policy assessments_write on public.assessments for all to authenticated using (
  ((select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id))
  and public.is_term_open(term_id)
) with check (
  ((select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id))
  and public.is_term_open(term_id)
);

create policy grades_select on public.grades for select to authenticated using (
  (select public.is_director()) or exists (
    select 1 from public.assessments a
    where a.id = grades.assessment_id
      and public.teacher_can_access_assignment(a.teacher_assignment_id)
  )
);
create policy grades_write on public.grades for all to authenticated using (
  exists (
    select 1 from public.assessments a
    where a.id = grades.assessment_id
      and ((select public.is_director()) or public.teacher_can_access_assignment(a.teacher_assignment_id))
      and public.is_term_open(a.term_id)
  )
) with check (
  exists (
    select 1 from public.assessments a
    where a.id = grades.assessment_id
      and ((select public.is_director()) or public.teacher_can_access_assignment(a.teacher_assignment_id))
      and public.is_term_open(a.term_id)
  )
);

create policy summative_select on public.summative_records for select to authenticated using (
  (select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id)
);
create policy summative_write on public.summative_records for all to authenticated using (
  ((select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id))
  and public.is_term_open(term_id)
) with check (
  ((select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id))
  and public.is_term_open(term_id)
);

create policy behavior_select on public.behavior_records for select to authenticated using (
  (select public.is_director()) or public.teacher_can_access_enrollment(enrollment_id)
);
create policy behavior_write on public.behavior_records for all to authenticated using (
  ((select public.is_director()) or public.teacher_can_access_enrollment(enrollment_id))
  and public.is_term_open(term_id)
) with check (
  ((select public.is_director()) or public.teacher_can_access_enrollment(enrollment_id))
  and public.is_term_open(term_id)
);

create policy recovery_select on public.recovery_records for select to authenticated using (
  (select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id)
);
create policy recovery_write on public.recovery_records for all to authenticated using (
  ((select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id))
  and public.is_assignment_year_open(teacher_assignment_id)
) with check (
  ((select public.is_director()) or public.teacher_can_access_assignment(teacher_assignment_id))
  and public.is_assignment_year_open(teacher_assignment_id)
);

create policy audit_director_select on public.audit_log for select to authenticated using ((select public.is_director()));

create or replace view public.v_term_subject_results
with (security_invoker = true)
as
select
  e.id as enrollment_id,
  s.id as student_id,
  concat_ws(' ', s.last_names, s.first_names) as student_name,
  e.academic_year_id,
  e.course_id,
  concat(c.grade_level, ' “', c.parallel, '”') as course_name,
  sub.id as subject_id,
  sub.name as subject_name,
  ta.id as teacher_assignment_id,
  t.id as term_id,
  t.name as term_name,
  t.order_no as term_order,
  round(f.formative_average, 2) as formative_average,
  round(f.formative_average * 0.70, 2) as weighted_70,
  round(
    case
      when sr.project_score is null and sr.initial_score is null then null
      else (coalesce(sr.project_score, 0) + coalesce(sr.initial_score, 0)) /
        nullif((sr.project_score is not null)::integer + (sr.initial_score is not null)::integer, 0)
    end,
    2
  ) as summative_base,
  public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score) as summative_final,
  round(public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score) * 0.30, 2) as weighted_30,
  public.term_final_score(
    f.formative_average,
    public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score)
  ) as final_score,
  public.alphabetic_scale(
    public.term_final_score(
      f.formative_average,
      public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score)
    )
  ) as alphabetic_scale,
  public.learning_scale(
    public.term_final_score(
      f.formative_average,
      public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score)
    )
  ) as learning_scale,
  case
    when f.formative_average is not null and public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score) is not null then 'complete'
    when f.formative_average is not null or public.staged_summative(sr.project_score, sr.initial_score, sr.improvement_score, sr.reinforcement_score) is not null then 'provisional'
    else 'incomplete'
  end as result_status
from public.enrollments e
join public.students s on s.id = e.student_id
join public.courses c on c.id = e.course_id
join public.teacher_assignments ta
  on ta.course_id = e.course_id
 and ta.academic_year_id = e.academic_year_id
 and ta.active = true
join public.subjects sub on sub.id = ta.subject_id
join public.terms t on t.academic_year_id = e.academic_year_id
left join lateral (
  select avg(g.score) as formative_average
  from public.assessments a
  join public.grades g
    on g.assessment_id = a.id
   and g.enrollment_id = e.id
  where a.teacher_assignment_id = ta.id
    and a.term_id = t.id
    and a.active = true
    and g.status = 'graded'
    and g.score is not null
) f on true
left join public.summative_records sr
  on sr.teacher_assignment_id = ta.id
 and sr.term_id = t.id
 and sr.enrollment_id = e.id
where e.status in ('active', 'withdrawn', 'completed');

create or replace view public.v_annual_subject_results
with (security_invoker = true)
as
with grouped as (
  select
    enrollment_id,
    student_id,
    student_name,
    academic_year_id,
    course_id,
    course_name,
    subject_id,
    subject_name,
    teacher_assignment_id,
    max(final_score) filter (where term_order = 1 and result_status <> 'incomplete') as term_1,
    max(final_score) filter (where term_order = 2 and result_status <> 'incomplete') as term_2,
    max(final_score) filter (where term_order = 3 and result_status <> 'incomplete') as term_3,
    avg(final_score) filter (where result_status <> 'incomplete') as annual_average,
    count(final_score) filter (where result_status <> 'incomplete') as terms_completed
  from public.v_term_subject_results
  group by enrollment_id, student_id, student_name, academic_year_id, course_id, course_name, subject_id, subject_name, teacher_assignment_id
)
select
  g.enrollment_id,
  g.student_id,
  g.student_name,
  g.academic_year_id,
  g.course_id,
  g.course_name,
  g.subject_id,
  g.subject_name,
  g.teacher_assignment_id,
  round(g.term_1, 2) as term_1,
  round(g.term_2, 2) as term_2,
  round(g.term_3, 2) as term_3,
  round(g.annual_average, 2) as annual_average,
  rr.score as recovery_score,
  round(
    case
      when g.annual_average is null then rr.score
      when rr.score is null then g.annual_average
      else (g.annual_average + rr.score) / 2
    end,
    2
  ) as final_score,
  public.alphabetic_scale(
    case
      when g.annual_average is null then rr.score
      when rr.score is null then g.annual_average
      else (g.annual_average + rr.score) / 2
    end
  ) as alphabetic_scale,
  public.learning_scale(
    case
      when g.annual_average is null then rr.score
      when rr.score is null then g.annual_average
      else (g.annual_average + rr.score) / 2
    end
  ) as learning_scale,
  g.terms_completed
from grouped g
left join public.recovery_records rr
  on rr.enrollment_id = g.enrollment_id
 and rr.teacher_assignment_id = g.teacher_assignment_id;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant select on public.v_term_subject_results to authenticated;
grant select on public.v_annual_subject_results to authenticated;
