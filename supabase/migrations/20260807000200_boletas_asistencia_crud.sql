-- UEF Loja - parche incremental de boletas, asistencia y catálogos
-- Conserva todos los datos existentes.
-- Aplicar con: npx supabase db push

create table public.qualitative_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  sort_order smallint not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qualitative_records (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.qualitative_areas(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  letter text not null check (letter in ('A+', 'A-', 'B+', 'B-', 'C+', 'C-', 'D+', 'D-', 'E+', 'E-')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (area_id, enrollment_id, term_id)
);

create table public.behavior_catalog (
  letter text primary key check (letter in ('A', 'B', 'C', 'D', 'E')),
  description text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.attendance_summaries (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  attended_days integer not null default 0 check (attended_days >= 0),
  justified_absences integer not null default 0 check (justified_absences >= 0),
  unjustified_absences integer not null default 0 check (unjustified_absences >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (enrollment_id, term_id)
);

create index qualitative_records_enrollment_term_idx
  on public.qualitative_records (enrollment_id, term_id);
create index attendance_summaries_enrollment_term_idx
  on public.attendance_summaries (enrollment_id, term_id);

create or replace function public.validate_student_term_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  enrollment_year uuid;
  term_year uuid;
begin
  select academic_year_id
    into enrollment_year
  from public.enrollments
  where id = new.enrollment_id;

  select academic_year_id
    into term_year
  from public.terms
  where id = new.term_id;

  if enrollment_year is distinct from term_year then
    raise exception 'El registro no corresponde al mismo año lectivo de la matrícula y el trimestre.';
  end if;

  return new;
end;
$$;

create trigger validate_qualitative_context
  before insert or update on public.qualitative_records
  for each row execute function public.validate_student_term_context();

create trigger validate_attendance_context
  before insert or update on public.attendance_summaries
  for each row execute function public.validate_student_term_context();

create trigger qualitative_areas_updated_at
  before update on public.qualitative_areas
  for each row execute function public.set_updated_at();

create trigger qualitative_records_updated_at
  before update on public.qualitative_records
  for each row execute function public.set_updated_at();

create trigger behavior_catalog_updated_at
  before update on public.behavior_catalog
  for each row execute function public.set_updated_at();

create trigger attendance_summaries_updated_at
  before update on public.attendance_summaries
  for each row execute function public.set_updated_at();

create trigger audit_qualitative_areas
  after insert or update or delete on public.qualitative_areas
  for each row execute function public.audit_row_change();

create trigger audit_qualitative_records
  after insert or update or delete on public.qualitative_records
  for each row execute function public.audit_row_change();

create trigger audit_attendance_summaries
  after insert or update or delete on public.attendance_summaries
  for each row execute function public.audit_row_change();

insert into public.qualitative_areas (name, short_name, sort_order)
values
  ('Animación a la lectura', 'ANIM. LECTURA', 1),
  ('Cívica y acompañamiento integral en el aula', 'CÍVICA', 2)
on conflict (name) do update
set short_name = excluded.short_name,
    sort_order = excluded.sort_order;

insert into public.behavior_catalog (letter, description)
values
  ('A', 'Lidera y promueve activamente iniciativas que favorecen la convivencia pacífica.'),
  ('B', 'Se involucra y participa en iniciativas que favorecen la convivencia pacífica.'),
  ('C', 'Participa en iniciativas de convivencia cuando recibe orientación y acompañamiento.'),
  ('D', 'Requiere acompañamiento frecuente para fortalecer su participación y convivencia.'),
  ('E', 'Presenta dificultades persistentes de convivencia que requieren intervención y seguimiento.')
on conflict (letter) do update
set description = excluded.description;

alter table public.qualitative_areas enable row level security;
alter table public.qualitative_records enable row level security;
alter table public.behavior_catalog enable row level security;
alter table public.attendance_summaries enable row level security;

create policy qualitative_areas_select
  on public.qualitative_areas
  for select to authenticated
  using (true);

create policy qualitative_areas_director_write
  on public.qualitative_areas
  for all to authenticated
  using ((select public.is_director()))
  with check ((select public.is_director()));

create policy qualitative_records_select
  on public.qualitative_records
  for select to authenticated
  using (
    (select public.is_director())
    or public.teacher_can_access_enrollment(enrollment_id)
  );

create policy qualitative_records_director_write
  on public.qualitative_records
  for all to authenticated
  using ((select public.is_director()))
  with check ((select public.is_director()));

create policy behavior_catalog_select
  on public.behavior_catalog
  for select to authenticated
  using (true);

create policy behavior_catalog_director_write
  on public.behavior_catalog
  for all to authenticated
  using ((select public.is_director()))
  with check ((select public.is_director()));

create policy attendance_summaries_select
  on public.attendance_summaries
  for select to authenticated
  using (
    (select public.is_director())
    or public.teacher_can_access_enrollment(enrollment_id)
  );

create policy attendance_summaries_director_write
  on public.attendance_summaries
  for all to authenticated
  using ((select public.is_director()))
  with check ((select public.is_director()));

grant select, insert, update, delete on public.qualitative_areas to authenticated;
grant select, insert, update, delete on public.qualitative_records to authenticated;
grant select, insert, update, delete on public.behavior_catalog to authenticated;
grant select, insert, update, delete on public.attendance_summaries to authenticated;

revoke all on public.qualitative_areas from anon;
revoke all on public.qualitative_records from anon;
revoke all on public.behavior_catalog from anon;
revoke all on public.attendance_summaries from anon;
