-- =====================================================================
-- UEF LOJA - DATOS COMPLEMENTARIOS DE PRUEBA V2
-- Requiere 20260811020000_complementarios_boletas_v2.sql
--
-- Completa los 300 estudiantes TEST-* con:
--   * Animación a la Lectura
--   * Cívica y Acompañamiento Integral en el Aula
--   * Comportamiento
--   * Asistencia resumida
-- para los tres trimestres.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. VALORACIONES CUALITATIVAS
-- ---------------------------------------------------------------------

with test_context as (
  select
    e.id as enrollment_id,
    t.id as term_id,
    t.number as term_number,
    ssub.id as subject_id,
    ssub.code as subject_code,
    (
      (regexp_match(st.national_id, '([0-9]{3})$'))[1]
    )::int as student_no
  from public.enrollments e
  join public.students st
    on st.id = e.student_id
   and st.national_id like 'TEST-%'
  join public.academic_years ay
    on ay.id = e.academic_year_id
   and ay.name = '2026-2027'
  join public.terms t
    on t.academic_year_id = ay.id
  join public.courses c
    on c.id = e.course_id
  join public.grade_subjects gs
    on gs.grade_level_id = c.grade_level_id
   and gs.active = true
  join public.subjects ssub
    on ssub.id = gs.subject_id
   and ssub.kind = 'qualitative'::public.subject_kind
   and ssub.code in ('AAL','CAI')
)
insert into public.qualitative_subject_records (
  enrollment_id,
  term_id,
  subject_id,
  letter,
  notes,
  updated_by
)
select
  enrollment_id,
  term_id,
  subject_id,
  case
    when student_no <= 4 then
      case
        when subject_code = 'AAL' then
          case term_number when 1 then 'C+' when 2 then 'B-' else 'B-' end
        else
          case term_number when 1 then 'B-' when 2 then 'B-' else 'B+' end
      end

    when student_no <= 10 then
      case
        when subject_code = 'AAL' then
          case term_number when 1 then 'B+' when 2 then 'B+' else 'A-' end
        else
          case term_number when 1 then 'B+' when 2 then 'A-' else 'A-' end
      end

    else
      case
        when subject_code = 'AAL' then
          case term_number when 1 then 'A-' when 2 then 'A-' else 'A+' end
        else
          case term_number when 1 then 'A-' when 2 then 'A+' else 'A+' end
      end
  end,
  'Dato ficticio para prueba funcional de boletas V2',
  (
    select id
    from public.profiles
    where role = 'director'
      and active = true
    order by created_at
    limit 1
  )
from test_context
on conflict (enrollment_id, term_id, subject_id)
do update set
  letter = excluded.letter,
  notes = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 2. COMPORTAMIENTO
-- ---------------------------------------------------------------------

with behavior_source as (
  select
    e.id as enrollment_id,
    t.id as term_id,
    t.number as term_number,
    (
      (regexp_match(st.national_id, '([0-9]{3})$'))[1]
    )::int as student_no
  from public.enrollments e
  join public.students st
    on st.id = e.student_id
   and st.national_id like 'TEST-%'
  join public.academic_years ay
    on ay.id = e.academic_year_id
   and ay.name = '2026-2027'
  join public.terms t
    on t.academic_year_id = ay.id
)
insert into public.behavior_records (
  enrollment_id,
  term_id,
  behavior_code,
  notes,
  updated_by
)
select
  enrollment_id,
  term_id,
  case
    when student_no <= 4 then
      case when term_number = 1 then 'C' else 'B' end
    when student_no <= 10 then 'B'
    else 'A'
  end,
  'Dato ficticio para prueba funcional de comportamiento V2',
  (
    select id
    from public.profiles
    where role = 'director'
      and active = true
    order by created_at
    limit 1
  )
from behavior_source
on conflict (enrollment_id, term_id)
do update set
  behavior_code = excluded.behavior_code,
  notes = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 3. ASISTENCIA
-- Cada estudiante acumula 200 jornadas registradas en el año.
-- ---------------------------------------------------------------------

with attendance_source as (
  select
    e.id as enrollment_id,
    t.id as term_id,
    t.number as term_number,
    (
      (regexp_match(st.national_id, '([0-9]{3})$'))[1]
    )::int as student_no,
    case t.number
      when 1 then 67
      when 2 then 66
      else 67
    end as total_term_days
  from public.enrollments e
  join public.students st
    on st.id = e.student_id
   and st.national_id like 'TEST-%'
  join public.academic_years ay
    on ay.id = e.academic_year_id
   and ay.name = '2026-2027'
  join public.terms t
    on t.academic_year_id = ay.id
),
absence_calc as (
  select
    *,
    case
      when student_no <= 4 then 1 + mod(student_no + term_number, 2)
      when student_no <= 10 then mod(student_no + term_number, 2)
      else mod(student_no + term_number, 2)
    end as justified,
    case
      when student_no <= 4 then 2 + mod(student_no + term_number, 2)
      when student_no <= 10 then mod(student_no + term_number, 2)
      else 0
    end as unjustified
  from attendance_source
)
insert into public.attendance_summaries (
  enrollment_id,
  term_id,
  attended_days,
  justified_absences,
  unjustified_absences,
  notes,
  updated_by
)
select
  enrollment_id,
  term_id,
  total_term_days - justified - unjustified,
  justified,
  unjustified,
  'Asistencia ficticia para prueba funcional V2',
  (
    select id
    from public.profiles
    where role = 'director'
      and active = true
    order by created_at
    limit 1
  )
from absence_calc
on conflict (enrollment_id, term_id)
do update set
  attended_days = excluded.attended_days,
  justified_absences = excluded.justified_absences,
  unjustified_absences = excluded.unjustified_absences,
  notes = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now();

commit;

-- ---------------------------------------------------------------------
-- CONTROL
-- ---------------------------------------------------------------------

select
  (select count(*) from public.qualitative_subject_records q
    join public.enrollments e on e.id = q.enrollment_id
    join public.students s on s.id = e.student_id
    where s.national_id like 'TEST-%') as cualitativas,
  (select count(*) from public.behavior_records b
    join public.enrollments e on e.id = b.enrollment_id
    join public.students s on s.id = e.student_id
    where s.national_id like 'TEST-%') as comportamiento,
  (select count(*) from public.attendance_summaries a
    join public.enrollments e on e.id = a.enrollment_id
    join public.students s on s.id = e.student_id
    where s.national_id like 'TEST-%') as asistencia;

-- Esperado:
-- cualitativas    = 1800  (300 x 3 x 2)
-- comportamiento  = 900   (300 x 3)
-- asistencia      = 900   (300 x 3)
