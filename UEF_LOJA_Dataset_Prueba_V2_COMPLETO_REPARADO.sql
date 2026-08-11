-- =====================================================================
-- UEF LOJA - DATOS INTEGRALES DE PRUEBA V2
-- Año lectivo: 2026-2027
--
-- Genera:
--   * 1 año lectivo activo
--   * 3 trimestres
--   * 12 cursos: 2.º a 7.º, paralelos A y B
--   * 12 docentes de prueba: 1 por curso
--   * 108 asignaciones docentes: 9 materias por curso
--   * 300 estudiantes: 25 por curso/paralelo
--   * 300 matrículas
--   * 1.008 evaluaciones ordinarias
--   * 25.200 calificaciones iniciales
--   * ejemplos de mejora directa y mejora con refuerzo
--   * 18 proyectos interdisciplinares para EGB Media
--   * 126 relaciones proyecto-asignatura
--   * 126 indicadores
--   * 3.150 notas de indicadores
--   * 450 registros de producto final/exposición
--   * evaluaciones supletorias para todos los casos elegibles
--
-- IMPORTANTE:
--   1. Este archivo está diseñado para el esquema V2 de las migraciones:
--      20260810235000_core_v2_normativa.sql
--      20260810235500_evaluation_engine_v2.sql
--   2. Los estudiantes y docentes generados son FICTICIOS.
--   3. Las identificaciones TEST-* y DOC-TEST-* no son cédulas reales.
--   4. No crea usuarios de Supabase Auth para los docentes.
--      Las cuentas deben crearse posteriormente con admin-users.
--   5. Las fechas de trimestres son DATOS DE PRUEBA y pueden editarse.
-- =====================================================================

begin;

set local statement_timeout = '180s';

-- ---------------------------------------------------------------------
-- 0. MODO DE CARGA
-- Este script convive con registros existentes. Solo genera/actualiza
-- identificadores TEST-* y DOC-TEST-* y objetos titulados [PRUEBA V2].
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. AÑO LECTIVO 2026-2027
-- ---------------------------------------------------------------------

update public.academic_years
set
  active = false,
  updated_at = now()
where active = true
  and lower(name) <> lower('2026-2027');

insert into public.academic_years (
  name,
  start_date,
  end_date,
  active,
  closed
)
select
  '2026-2027',
  date '2026-05-04',
  date '2027-02-26',
  true,
  false
where not exists (
  select 1
  from public.academic_years
  where lower(name) = lower('2026-2027')
);

update public.academic_years
set
  start_date = date '2026-05-04',
  end_date   = date '2027-02-26',
  active     = true,
  closed     = false,
  updated_at = now()
where lower(name) = lower('2026-2027');

-- ---------------------------------------------------------------------
-- 2. TRES TRIMESTRES
-- Fechas únicamente para prueba funcional.
-- ---------------------------------------------------------------------

insert into public.terms (
  academic_year_id,
  number,
  name,
  start_date,
  end_date,
  closed
)
select
  ay.id,
  src.number,
  src.name,
  src.start_date,
  src.end_date,
  false
from public.academic_years ay
cross join (
  values
    (1::smallint, 'Trimestre 1', date '2026-05-04', date '2026-08-07'),
    (2::smallint, 'Trimestre 2', date '2026-08-10', date '2026-11-13'),
    (3::smallint, 'Trimestre 3', date '2026-11-16', date '2027-02-26')
) as src(number, name, start_date, end_date)
where lower(ay.name) = lower('2026-2027')
on conflict (academic_year_id, number)
do update set
  name       = excluded.name,
  start_date = excluded.start_date,
  end_date   = excluded.end_date,
  closed     = false,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 3. CURSOS: 2.º A/B HASTA 7.º A/B
-- ---------------------------------------------------------------------

insert into public.courses (
  academic_year_id,
  grade_level_id,
  parallel,
  active
)
select
  ay.id,
  gl.id,
  p.parallel,
  true
from public.academic_years ay
join public.grade_levels gl
  on gl.ordinal between 2 and 7
cross join (
  values ('A'::text), ('B'::text)
) as p(parallel)
where lower(ay.name) = lower('2026-2027')
on conflict (academic_year_id, grade_level_id, parallel)
do update set
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 4. DOCENTES FICTICIOS: UNO POR CURSO
-- ---------------------------------------------------------------------

insert into public.teachers (
  profile_id,
  first_names,
  last_names,
  national_id,
  email,
  active
)
select
  null,
  'Docente',
  'Prueba ' || gl.code || ' ' || c.parallel,
  'DOC-TEST-' || gl.code || '-' || c.parallel,
  lower('docente.' || gl.code || c.parallel || '@prueba.local'),
  true
from public.courses c
join public.academic_years ay
  on ay.id = c.academic_year_id
join public.grade_levels gl
  on gl.id = c.grade_level_id
where lower(ay.name) = lower('2026-2027')
on conflict (national_id) where national_id is not null
do update set
  first_names = excluded.first_names,
  last_names  = excluded.last_names,
  email       = excluded.email,
  active      = true,
  updated_at  = now();

-- ---------------------------------------------------------------------
-- 5. ASIGNACIONES DOCENTES
-- El mismo docente de cada curso queda asignado a las nueve materias.
-- ---------------------------------------------------------------------

insert into public.teacher_assignments (
  academic_year_id,
  teacher_id,
  course_id,
  subject_id,
  active
)
select
  ay.id,
  t.id,
  c.id,
  gs.subject_id,
  true
from public.courses c
join public.academic_years ay
  on ay.id = c.academic_year_id
join public.grade_levels gl
  on gl.id = c.grade_level_id
join public.teachers t
  on t.national_id = 'DOC-TEST-' || gl.code || '-' || c.parallel
join public.grade_subjects gs
  on gs.grade_level_id = gl.id
 and gs.active = true
join public.subjects s
  on s.id = gs.subject_id
 and s.active = true
where lower(ay.name) = lower('2026-2027')
on conflict (academic_year_id, course_id, subject_id)
do update set
  teacher_id = excluded.teacher_id,
  active     = true,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 6. 300 ESTUDIANTES FICTICIOS
-- 25 estudiantes por cada curso/paralelo.
-- ---------------------------------------------------------------------

with source_students as (
  select
    gl.id as grade_level_id,
    gl.code as grade_code,
    gl.name as grade_name,
    gl.ordinal,
    c.id as course_id,
    c.parallel,
    gs.n,
    'TEST-' || gl.code || '-' || c.parallel || '-' ||
      lpad(gs.n::text, 3, '0') as national_id,
    'Estudiante ' || lpad(gs.n::text, 2, '0') as first_names,
    'Prueba ' || gl.code || ' ' || c.parallel as last_names,
    (
      date '2019-01-15'
      - ((gl.ordinal - 2) * interval '1 year')
      + ((gs.n - 1) * interval '5 days')
    )::date as birth_date
  from public.courses c
  join public.academic_years ay
    on ay.id = c.academic_year_id
  join public.grade_levels gl
    on gl.id = c.grade_level_id
  cross join generate_series(1, 25) as gs(n)
  where lower(ay.name) = lower('2026-2027')
)
insert into public.students (
  first_names,
  last_names,
  national_id,
  birth_date,
  active
)
select
  first_names,
  last_names,
  national_id,
  birth_date,
  true
from source_students
on conflict (national_id) where national_id is not null
do update set
  first_names = excluded.first_names,
  last_names  = excluded.last_names,
  birth_date  = excluded.birth_date,
  active      = true,
  updated_at  = now();

-- ---------------------------------------------------------------------
-- 7. MATRÍCULAS
-- ---------------------------------------------------------------------

with source_enrollments as (
  select
    ay.id as academic_year_id,
    c.id as course_id,
    gl.code as grade_code,
    c.parallel,
    gs.n,
    'TEST-' || gl.code || '-' || c.parallel || '-' ||
      lpad(gs.n::text, 3, '0') as national_id
  from public.courses c
  join public.academic_years ay
    on ay.id = c.academic_year_id
  join public.grade_levels gl
    on gl.id = c.grade_level_id
  cross join generate_series(1, 25) as gs(n)
  where lower(ay.name) = lower('2026-2027')
)
insert into public.enrollments (
  student_id,
  academic_year_id,
  course_id,
  status,
  enrolled_on,
  withdrawn_on,
  withdrawal_reason
)
select
  s.id,
  src.academic_year_id,
  src.course_id,
  'active'::public.enrollment_status,
  date '2026-05-04',
  null,
  null
from source_enrollments src
join public.students s
  on s.national_id = src.national_id
on conflict (student_id, academic_year_id)
do update set
  course_id          = excluded.course_id,
  status             = 'active'::public.enrollment_status,
  enrolled_on        = excluded.enrolled_on,
  withdrawn_on       = null,
  withdrawal_reason  = null,
  updated_at         = now();

-- ---------------------------------------------------------------------
-- 8. LIMPIEZA DE EVALUACIONES DE PRUEBA PREVIAS
-- Permite repetir el script durante esta etapa de pruebas.
-- ---------------------------------------------------------------------

delete from public.supplementary_exams se
using public.enrollments e,
      public.students s,
      public.academic_years ay
where se.enrollment_id = e.id
  and e.student_id = s.id
  and e.academic_year_id = ay.id
  and lower(ay.name) = lower('2026-2027')
  and s.national_id like 'TEST-%';

delete from public.interdisciplinary_projects p
using public.academic_years ay
where p.academic_year_id = ay.id
  and lower(ay.name) = lower('2026-2027')
  and p.name like '[PRUEBA V2]%';

delete from public.assessments a
using public.academic_years ay
where a.academic_year_id = ay.id
  and lower(ay.name) = lower('2026-2027')
  and a.title like '[PRUEBA V2]%';

-- ---------------------------------------------------------------------
-- 9. EVALUACIONES ORDINARIAS
--
-- Por asignatura y trimestre:
--   TAI = formativa
--   LE  = formativa
--   TAG = formativa
--   SUM = sumativa
--
-- En Elemental, el motor ignora la ponderación y realiza promedio simple.
-- En Media, TAI + LE alimentan 70 %, SUM alimenta 30 % junto con proyecto.
-- ---------------------------------------------------------------------

insert into public.assessments (
  academic_year_id,
  term_id,
  course_id,
  subject_id,
  teacher_assignment_id,
  activity_type_id,
  title,
  category,
  assessment_date,
  active,
  created_by
)
select
  ay.id,
  tr.id,
  c.id,
  s.id,
  ta.id,
  at.id,
  '[PRUEBA V2] ' || src.label || ' - ' || s.code ||
    ' - T' || tr.number,
  src.category::public.assessment_category,
  (
    tr.start_date +
    case src.code
      when 'TAI' then 14
      when 'LE'  then 35
      when 'TAG' then 48
      else 60
    end
  )::date,
  true,
  (
    select p.id
    from public.profiles p
    where p.role = 'director'
      and p.active = true
    order by p.created_at
    limit 1
  )
from public.academic_years ay
join public.terms tr
  on tr.academic_year_id = ay.id
join public.courses c
  on c.academic_year_id = ay.id
join public.grade_subjects gsub
  on gsub.grade_level_id = c.grade_level_id
 and gsub.active = true
join public.subjects s
  on s.id = gsub.subject_id
 and s.active = true
 and s.kind = 'quantitative'
join public.teacher_assignments ta
  on ta.academic_year_id = ay.id
 and ta.course_id = c.id
 and ta.subject_id = s.id
 and ta.active = true
cross join (
  values
    ('TAI'::text, 'Tarea / deber',       'formative'::text),
    ('LE'::text,  'Lección escrita',     'formative'::text),
    ('TAG'::text, 'Taller',              'formative'::text),
    ('SUM'::text, 'Evaluación sumativa', 'summative'::text)
) as src(code, label, category)
join public.assessment_activity_types at
  on at.code = src.code
where lower(ay.name) = lower('2026-2027');

-- ---------------------------------------------------------------------
-- 10. CALIFICACIONES ORDINARIAS
--
-- Distribución intencional:
--   estudiantes 01-04 : rendimiento bajo (aprox. 5-6)
--   estudiantes 05-10 : rendimiento medio (aprox. 7-8)
--   estudiantes 11-25 : rendimiento alto (aprox. 8-10)
--
-- Esto permite probar analítica, mejora y supletorio.
-- ---------------------------------------------------------------------

with grade_source as (
  select
    a.id as assessment_id,
    e.id as enrollment_id,
    tr.number as term_number,
    subj.sort_order,
    at.code as activity_code,
    (
      (regexp_match(st.national_id, '([0-9]{3})$'))[1]
    )::int as student_no,

    case
      when (
        (regexp_match(st.national_id, '([0-9]{3})$'))[1]
      )::int <= 4
      then
        5.20
        + (
          mod(
            (
              (regexp_match(st.national_id, '([0-9]{3})$'))[1]
            )::int - 1,
            4
          ) * 0.25
        )

      when (
        (regexp_match(st.national_id, '([0-9]{3})$'))[1]
      )::int <= 10
      then
        7.15
        + (
          mod(
            (
              (regexp_match(st.national_id, '([0-9]{3})$'))[1]
            )::int - 5,
            6
          ) * 0.12
        )

      else
        8.20
        + (
          mod(
            (
              (regexp_match(st.national_id, '([0-9]{3})$'))[1]
            )::int - 11,
            15
          ) * 0.07
        )
    end
    +
    ((tr.number - 1) * 0.10)
    +
    (mod((subj.sort_order / 10)::int, 3) * 0.10)
    +
    case at.code
      when 'TAI' then 0.00
      when 'LE'  then 0.20
      when 'TAG' then 0.10
      when 'SUM' then 0.30
      else 0.00
    end as calculated_score

  from public.assessments a
  join public.academic_years ay
    on ay.id = a.academic_year_id
  join public.terms tr
    on tr.id = a.term_id
  join public.subjects subj
    on subj.id = a.subject_id
  join public.assessment_activity_types at
    on at.id = a.activity_type_id
  join public.enrollments e
    on e.course_id = a.course_id
   and e.academic_year_id = a.academic_year_id
   and e.status = 'active'::public.enrollment_status
  join public.students st
    on st.id = e.student_id
   and st.national_id like 'TEST-%'
  where lower(ay.name) = lower('2026-2027')
    and a.title like '[PRUEBA V2]%'
)
insert into public.assessment_grades (
  assessment_id,
  enrollment_id,
  initial_score,
  direct_improvement_score,
  reinforcement_score,
  reinforced_improvement_score,
  notes,
  updated_by
)
select
  assessment_id,
  enrollment_id,
  round(
    least(10.00, greatest(1.00, calculated_score))::numeric,
    2
  ),
  null,
  null,
  null,
  'Calificación ficticia generada para prueba funcional V2',
  (
    select p.id
    from public.profiles p
    where p.role = 'director'
      and p.active = true
    order by p.created_at
    limit 1
  )
from grade_source
on conflict (assessment_id, enrollment_id)
do update set
  initial_score                = excluded.initial_score,
  direct_improvement_score     = null,
  reinforcement_score          = null,
  reinforced_improvement_score = null,
  notes                        = excluded.notes,
  updated_by                   = excluded.updated_by,
  updated_at                   = now();

-- ---------------------------------------------------------------------
-- 11. EJEMPLOS DE MEJORA
--
-- Estudiante 05 de cada curso de MEDIA:
--   mejora directa en Matemática, T1, evaluación SUM.
--
-- Estudiante 01 de cada curso de MEDIA:
--   mejora con refuerzo en Matemática, T1, evaluación SUM.
-- ---------------------------------------------------------------------

update public.assessment_grades ag
set
  direct_improvement_score = 8.60,
  notes = 'PRUEBA V2 - Ejemplo de mejora directa',
  updated_at = now()
from public.assessments a
join public.academic_years ay
  on ay.id = a.academic_year_id
join public.terms tr
  on tr.id = a.term_id
join public.courses c
  on c.id = a.course_id
join public.grade_levels gl
  on gl.id = c.grade_level_id
join public.subjects subj
  on subj.id = a.subject_id
join public.assessment_activity_types at
  on at.id = a.activity_type_id
join public.enrollments e
  on e.course_id = c.id
 and e.academic_year_id = ay.id
join public.students st
  on st.id = e.student_id
where ag.assessment_id = a.id
  and ag.enrollment_id = e.id
  and lower(ay.name) = lower('2026-2027')
  and gl.sublevel = 'media'
  and subj.code = 'MAT'
  and tr.number = 1
  and at.code = 'SUM'
  and st.national_id =
      'TEST-' || gl.code || '-' || c.parallel || '-005';

update public.assessment_grades ag
set
  reinforcement_score = 8.00,
  reinforced_improvement_score = 8.00,
  notes = 'PRUEBA V2 - Ejemplo de mejora con refuerzo',
  updated_at = now()
from public.assessments a
join public.academic_years ay
  on ay.id = a.academic_year_id
join public.terms tr
  on tr.id = a.term_id
join public.courses c
  on c.id = a.course_id
join public.grade_levels gl
  on gl.id = c.grade_level_id
join public.subjects subj
  on subj.id = a.subject_id
join public.assessment_activity_types at
  on at.id = a.activity_type_id
join public.enrollments e
  on e.course_id = c.id
 and e.academic_year_id = ay.id
join public.students st
  on st.id = e.student_id
where ag.assessment_id = a.id
  and ag.enrollment_id = e.id
  and lower(ay.name) = lower('2026-2027')
  and gl.sublevel = 'media'
  and subj.code = 'MAT'
  and tr.number = 1
  and at.code = 'SUM'
  and st.national_id =
      'TEST-' || gl.code || '-' || c.parallel || '-001';

-- ---------------------------------------------------------------------
-- 12. PROYECTOS INTERDISCIPLINARES
-- Solo para EGB MEDIA: 5.º, 6.º y 7.º.
-- Uno por curso y trimestre.
-- ---------------------------------------------------------------------

insert into public.interdisciplinary_projects (
  academic_year_id,
  term_id,
  course_id,
  name,
  description,
  product_description,
  presentation_description,
  status,
  created_by
)
select
  ay.id,
  tr.id,
  c.id,
  '[PRUEBA V2] Proyecto interdisciplinar T' || tr.number,
  'Proyecto interdisciplinar ficticio para probar el motor 70/30.',
  'Producto final de prueba.',
  'Exposición final de prueba.',
  'active'::public.project_status,
  (
    select p.id
    from public.profiles p
    where p.role = 'director'
      and p.active = true
    order by p.created_at
    limit 1
  )
from public.academic_years ay
join public.terms tr
  on tr.academic_year_id = ay.id
join public.courses c
  on c.academic_year_id = ay.id
join public.grade_levels gl
  on gl.id = c.grade_level_id
where lower(ay.name) = lower('2026-2027')
  and gl.sublevel = 'media'
on conflict (term_id, course_id, name)
do update set
  description              = excluded.description,
  product_description      = excluded.product_description,
  presentation_description = excluded.presentation_description,
  status                   = 'active'::public.project_status,
  updated_at               = now();

-- ---------------------------------------------------------------------
-- 13. MATERIAS PARTICIPANTES DEL PROYECTO
-- Las siete asignaturas cuantitativas participan.
-- ---------------------------------------------------------------------

insert into public.project_subjects (
  project_id,
  subject_id,
  teacher_assignment_id,
  active
)
select
  p.id,
  subj.id,
  ta.id,
  true
from public.interdisciplinary_projects p
join public.courses c
  on c.id = p.course_id
join public.grade_subjects gs
  on gs.grade_level_id = c.grade_level_id
 and gs.active = true
join public.subjects subj
  on subj.id = gs.subject_id
 and subj.kind = 'quantitative'
 and subj.active = true
left join public.teacher_assignments ta
  on ta.academic_year_id = p.academic_year_id
 and ta.course_id = p.course_id
 and ta.subject_id = subj.id
 and ta.active = true
where p.name like '[PRUEBA V2]%'
on conflict (project_id, subject_id)
do update set
  teacher_assignment_id = excluded.teacher_assignment_id,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 14. UN INDICADOR POR ASIGNATURA
-- ---------------------------------------------------------------------

insert into public.project_indicators (
  project_subject_id,
  code,
  description,
  sort_order,
  active
)
select
  ps.id,
  'IND-' || subj.code,
  'Indicador ficticio de ' || subj.name ||
    ' para la prueba del proyecto interdisciplinar.',
  10,
  true
from public.project_subjects ps
join public.interdisciplinary_projects p
  on p.id = ps.project_id
join public.subjects subj
  on subj.id = ps.subject_id
where p.name like '[PRUEBA V2]%';

-- ---------------------------------------------------------------------
-- 15. PRODUCTO FINAL Y EXPOSICIÓN POR ESTUDIANTE
-- ---------------------------------------------------------------------

with component_source as (
  select
    p.id as project_id,
    e.id as enrollment_id,
    tr.number as term_number,
    (
      (regexp_match(st.national_id, '([0-9]{3})$'))[1]
    )::int as student_no
  from public.interdisciplinary_projects p
  join public.terms tr
    on tr.id = p.term_id
  join public.enrollments e
    on e.course_id = p.course_id
   and e.academic_year_id = p.academic_year_id
   and e.status = 'active'::public.enrollment_status
  join public.students st
    on st.id = e.student_id
   and st.national_id like 'TEST-%'
  where p.name like '[PRUEBA V2]%'
)
insert into public.project_student_components (
  project_id,
  enrollment_id,
  product_score,
  presentation_score,
  updated_by
)
select
  project_id,
  enrollment_id,

  round(
    least(
      10.00,
      case
        when student_no <= 4
          then 5.60 + ((student_no - 1) * 0.20)
                    + ((term_number - 1) * 0.10)
        when student_no <= 10
          then 7.50 + ((student_no - 5) * 0.10)
                    + ((term_number - 1) * 0.10)
        else 8.50 + ((student_no - 11) * 0.05)
                  + ((term_number - 1) * 0.10)
      end
    )::numeric,
    2
  ),

  round(
    least(
      10.00,
      case
        when student_no <= 4
          then 5.80 + ((student_no - 1) * 0.20)
                    + ((term_number - 1) * 0.10)
        when student_no <= 10
          then 7.70 + ((student_no - 5) * 0.10)
                    + ((term_number - 1) * 0.10)
        else 8.70 + ((student_no - 11) * 0.05)
                  + ((term_number - 1) * 0.10)
      end
    )::numeric,
    2
  ),

  (
    select pr.id
    from public.profiles pr
    where pr.role = 'director'
      and pr.active = true
    order by pr.created_at
    limit 1
  )
from component_source
on conflict (project_id, enrollment_id)
do update set
  product_score      = excluded.product_score,
  presentation_score = excluded.presentation_score,
  updated_by         = excluded.updated_by,
  updated_at         = now();

-- ---------------------------------------------------------------------
-- 16. NOTA DE INDICADORES POR ESTUDIANTE Y ASIGNATURA
-- ---------------------------------------------------------------------

with indicator_source as (
  select
    pi.id as indicator_id,
    e.id as enrollment_id,
    tr.number as term_number,
    subj.sort_order,
    (
      (regexp_match(st.national_id, '([0-9]{3})$'))[1]
    )::int as student_no
  from public.project_indicators pi
  join public.project_subjects ps
    on ps.id = pi.project_subject_id
  join public.interdisciplinary_projects p
    on p.id = ps.project_id
  join public.terms tr
    on tr.id = p.term_id
  join public.subjects subj
    on subj.id = ps.subject_id
  join public.enrollments e
    on e.course_id = p.course_id
   and e.academic_year_id = p.academic_year_id
   and e.status = 'active'::public.enrollment_status
  join public.students st
    on st.id = e.student_id
   and st.national_id like 'TEST-%'
  where p.name like '[PRUEBA V2]%'
)
insert into public.project_indicator_scores (
  indicator_id,
  enrollment_id,
  score,
  updated_by
)
select
  indicator_id,
  enrollment_id,

  round(
    least(
      10.00,
      case
        when student_no <= 4
          then 5.40 + ((student_no - 1) * 0.20)
                    + ((term_number - 1) * 0.10)
                    + (mod((sort_order / 10)::int, 3) * 0.10)
        when student_no <= 10
          then 7.40 + ((student_no - 5) * 0.10)
                    + ((term_number - 1) * 0.10)
                    + (mod((sort_order / 10)::int, 3) * 0.10)
        else 8.40 + ((student_no - 11) * 0.05)
                  + ((term_number - 1) * 0.10)
                  + (mod((sort_order / 10)::int, 3) * 0.10)
      end
    )::numeric,
    2
  ),

  (
    select pr.id
    from public.profiles pr
    where pr.role = 'director'
      and pr.active = true
    order by pr.created_at
    limit 1
  )
from indicator_source
on conflict (indicator_id, enrollment_id)
do update set
  score      = excluded.score,
  updated_by = excluded.updated_by,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 17. SUPLETORIOS DE PRUEBA
--
-- El motor decide la elegibilidad automáticamente.
-- Se agrega 8,50 a todos los casos elegibles para probar el módulo.
-- ---------------------------------------------------------------------

insert into public.supplementary_exams (
  enrollment_id,
  subject_id,
  exam_score,
  exam_date,
  notes,
  updated_by
)
select
  el.enrollment_id,
  el.subject_id,
  8.50,
  date '2027-03-05',
  'Supletorio ficticio generado para prueba V2',
  (
    select pr.id
    from public.profiles pr
    where pr.role = 'director'
      and pr.active = true
    order by pr.created_at
    limit 1
  )
from public.v_supplementary_eligibility el
join public.enrollments e
  on e.id = el.enrollment_id
join public.students st
  on st.id = e.student_id
where el.eligible = true
  and st.national_id like 'TEST-%'
on conflict (enrollment_id, subject_id)
do update set
  exam_score = excluded.exam_score,
  exam_date  = excluded.exam_date,
  notes      = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now();


-- ---------------------------------------------------------------------
-- 18. VALIDACIÓN TRANSACCIONAL ANTES DE CONFIRMAR
-- ---------------------------------------------------------------------

do $$
declare
  v_courses integer;
  v_students integer;
  v_enrollments integer;
  v_teachers integer;
  v_assessments integer;
  v_grades integer;
  v_projects integer;
begin
  select count(*)
    into v_courses
  from public.courses c
  join public.academic_years ay on ay.id = c.academic_year_id
  where lower(ay.name) = lower('2026-2027');

  select count(*)
    into v_students
  from public.students
  where national_id like 'TEST-%';

  select count(*)
    into v_enrollments
  from public.enrollments e
  join public.students s on s.id = e.student_id
  join public.academic_years ay on ay.id = e.academic_year_id
  where s.national_id like 'TEST-%'
    and lower(ay.name) = lower('2026-2027')
    and e.status = 'active'::public.enrollment_status;

  select count(*)
    into v_teachers
  from public.teachers
  where national_id like 'DOC-TEST-%';

  select count(*)
    into v_assessments
  from public.assessments
  where title like '[PRUEBA V2]%';

  select count(*)
    into v_grades
  from public.assessment_grades ag
  join public.assessments a on a.id = ag.assessment_id
  where a.title like '[PRUEBA V2]%';

  select count(*)
    into v_projects
  from public.interdisciplinary_projects
  where name like '[PRUEBA V2]%';

  if v_courses < 12 then
    raise exception 'Carga incompleta: se esperaban al menos 12 cursos y existen %.', v_courses;
  end if;

  if v_students <> 300 then
    raise exception 'Carga incompleta: se esperaban 300 estudiantes TEST y existen %.', v_students;
  end if;

  if v_enrollments <> 300 then
    raise exception 'Carga incompleta: se esperaban 300 matrículas TEST activas y existen %.', v_enrollments;
  end if;

  if v_teachers <> 12 then
    raise exception 'Carga incompleta: se esperaban 12 docentes TEST y existen %.', v_teachers;
  end if;

  if v_assessments <> 1008 then
    raise exception 'Carga incompleta: se esperaban 1008 evaluaciones de prueba y existen %.', v_assessments;
  end if;

  if v_grades <> 25200 then
    raise exception 'Carga incompleta: se esperaban 25200 calificaciones y existen %.', v_grades;
  end if;

  if v_projects <> 18 then
    raise exception 'Carga incompleta: se esperaban 18 proyectos y existen %.', v_projects;
  end if;
end
$$;

commit;

-- =====================================================================
-- VERIFICACIONES
-- =====================================================================

-- A. Año y trimestres
select
  ay.name as anio_lectivo,
  ay.active,
  ay.closed,
  count(t.id) as trimestres
from public.academic_years ay
left join public.terms t
  on t.academic_year_id = ay.id
where lower(ay.name) = lower('2026-2027')
group by ay.id, ay.name, ay.active, ay.closed;

-- Esperado: 2026-2027 | true | false | 3


-- B. 25 estudiantes por cada curso/paralelo
select
  gl.name as grado,
  c.parallel,
  count(e.id) as estudiantes
from public.courses c
join public.grade_levels gl
  on gl.id = c.grade_level_id
join public.academic_years ay
  on ay.id = c.academic_year_id
left join public.enrollments e
  on e.course_id = c.id
 and e.status = 'active'::public.enrollment_status
left join public.students st
  on st.id = e.student_id
 and st.national_id like 'TEST-%'
where lower(ay.name) = lower('2026-2027')
group by gl.ordinal, gl.name, c.parallel
order by gl.ordinal, c.parallel;

-- Esperado:
-- 12 filas, cada una con 25.


-- C. Totales generales
select
  (
    select count(*)
    from public.courses c
    join public.academic_years ay on ay.id = c.academic_year_id
    where lower(ay.name) = lower('2026-2027')
  ) as cursos,

  (
    select count(*)
    from public.teachers
    where national_id like 'DOC-TEST-%'
  ) as docentes,

  (
    select count(*)
    from public.students
    where national_id like 'TEST-%'
  ) as estudiantes,

  (
    select count(*)
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where st.national_id like 'TEST-%'
  ) as matriculas,

  (
    select count(*)
    from public.teacher_assignments ta
    join public.courses c on c.id = ta.course_id
    join public.academic_years ay on ay.id = c.academic_year_id
    where lower(ay.name) = lower('2026-2027')
  ) as asignaciones_docentes,

  (
    select count(*)
    from public.assessments
    where title like '[PRUEBA V2]%'
  ) as evaluaciones,

  (
    select count(*)
    from public.assessment_grades ag
    join public.assessments a on a.id = ag.assessment_id
    where a.title like '[PRUEBA V2]%'
  ) as calificaciones,

  (
    select count(*)
    from public.interdisciplinary_projects
    where name like '[PRUEBA V2]%'
  ) as proyectos,

  (
    select count(*)
    from public.supplementary_exams se
    join public.enrollments e on e.id = se.enrollment_id
    join public.students st on st.id = e.student_id
    where st.national_id like 'TEST-%'
  ) as supletorios;

-- Esperados antes de considerar supletorios:
-- cursos                = 12
-- docentes              = 12
-- estudiantes           = 300
-- matriculas            = 300
-- asignaciones_docentes = 108
-- evaluaciones           = 1008
-- calificaciones         = 25200
-- proyectos              = 18
-- supletorios            = depende de la elegibilidad calculada


-- D. Validación de modelos de evaluación
select
  gl.name,
  gl.sublevel,
  gl.evaluation_model,
  count(distinct c.id) as cursos
from public.courses c
join public.grade_levels gl
  on gl.id = c.grade_level_id
join public.academic_years ay
  on ay.id = c.academic_year_id
where lower(ay.name) = lower('2026-2027')
group by gl.ordinal, gl.name, gl.sublevel, gl.evaluation_model
order by gl.ordinal;


-- E. Ejemplo de resultados trimestrales calculados por PostgreSQL
select
  st.national_id,
  st.last_names,
  st.first_names,
  gl.name as grado,
  c.parallel,
  subj.name as asignatura,
  r.term_number,
  r.formative_average,
  r.summative_average,
  r.term_score,
  r.qualitative
from public.v_subject_term_results r
join public.students st
  on st.id = r.student_id
join public.courses c
  on c.id = r.course_id
join public.grade_levels gl
  on gl.id = r.grade_level_id
join public.subjects subj
  on subj.id = r.subject_id
where st.national_id like 'TEST-%'
order by
  gl.ordinal,
  c.parallel,
  st.national_id,
  subj.sort_order,
  r.term_number
limit 100;


-- F. Ejemplo de resultados anuales
select
  st.national_id,
  gl.name as grado,
  c.parallel,
  subj.name as asignatura,
  r.term_1,
  r.term_2,
  r.term_3,
  r.annual_score,
  r.qualitative
from public.v_subject_annual_results r
join public.students st
  on st.id = r.student_id
join public.courses c
  on c.id = r.course_id
join public.grade_levels gl
  on gl.id = r.grade_level_id
join public.subjects subj
  on subj.id = r.subject_id
where st.national_id like 'TEST-%'
order by
  gl.ordinal,
  c.parallel,
  st.national_id,
  subj.sort_order
limit 100;


-- G. Proyectos
select
  gl.name as grado,
  c.parallel,
  tr.name as trimestre,
  p.name as proyecto,
  count(distinct ps.subject_id) as materias
from public.interdisciplinary_projects p
join public.courses c on c.id = p.course_id
join public.grade_levels gl on gl.id = c.grade_level_id
join public.terms tr on tr.id = p.term_id
left join public.project_subjects ps on ps.project_id = p.id
where p.name like '[PRUEBA V2]%'
group by gl.ordinal, gl.name, c.parallel, tr.number, tr.name, p.name
order by gl.ordinal, c.parallel, tr.number;


-- H. Mejoras creadas
select
  st.national_id,
  subj.name as asignatura,
  tr.name as trimestre,
  ag.initial_score,
  ag.direct_improvement_score,
  ag.reinforcement_score,
  ag.reinforced_improvement_score,
  public.effective_assessment_score(
    ag.initial_score,
    ag.direct_improvement_score,
    ag.reinforcement_score,
    ag.reinforced_improvement_score
  ) as nota_efectiva
from public.assessment_grades ag
join public.assessments a on a.id = ag.assessment_id
join public.enrollments e on e.id = ag.enrollment_id
join public.students st on st.id = e.student_id
join public.subjects subj on subj.id = a.subject_id
join public.terms tr on tr.id = a.term_id
where ag.direct_improvement_score is not null
   or ag.reinforcement_score is not null
order by st.national_id;


-- I. Elegibilidad y supletorios
select
  st.national_id,
  gl.name as grado,
  c.parallel,
  subj.name as asignatura,
  el.annual_score,
  el.eligible,
  el.exam_score
from public.v_supplementary_eligibility el
join public.enrollments e on e.id = el.enrollment_id
join public.students st on st.id = e.student_id
join public.courses c on c.id = el.course_id
join public.grade_levels gl on gl.id = el.grade_level_id
join public.subjects subj on subj.id = el.subject_id
where st.national_id like 'TEST-%'
  and el.eligible = true
order by gl.ordinal, c.parallel, st.national_id, subj.sort_order;


-- J. Diagnóstico exacto del libro mostrado en pantalla:
-- 2DO DE EGB A · Ciencias Naturales · Trimestre 1
select
  gl.name as grado,
  c.parallel,
  subj.name as asignatura,
  tr.name as trimestre,
  count(distinct e.id) as matriculados,
  count(distinct a.id) as evaluaciones,
  count(ag.id) as calificaciones_guardadas
from public.courses c
join public.grade_levels gl on gl.id = c.grade_level_id
join public.academic_years ay on ay.id = c.academic_year_id
join public.terms tr on tr.academic_year_id = ay.id and tr.number = 1
join public.subjects subj on subj.code = 'CCNN'
left join public.enrollments e
  on e.course_id = c.id
 and e.academic_year_id = ay.id
 and e.status = 'active'::public.enrollment_status
left join public.students st
  on st.id = e.student_id
left join public.assessments a
  on a.course_id = c.id
 and a.academic_year_id = ay.id
 and a.term_id = tr.id
 and a.subject_id = subj.id
 and a.active = true
left join public.assessment_grades ag
  on ag.assessment_id = a.id
 and ag.enrollment_id = e.id
where lower(ay.name) = lower('2026-2027')
  and gl.code = '2EGB'
  and c.parallel = 'A'
  and (st.national_id is null or st.national_id like 'TEST-%')
group by gl.name, c.parallel, subj.name, tr.name;
-- Esperado con el dataset de prueba:
-- matriculados = 25
-- evaluaciones = 4
-- calificaciones_guardadas = 100
