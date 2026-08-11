-- =====================================================================
-- UEF LOJA - FASE 4.1
-- RESULTADOS ACADÉMICOS OPTIMIZADOS
-- Migración: 20260811014500_resultados_optimizados_v2.sql
--
-- Motivo:
-- Las vistas globales v_subject_term_results / v_subject_annual_results
-- calculan una combinación amplia de estudiantes, asignaturas y períodos.
-- Con datos de prueba completos pueden superar statement_timeout.
--
-- Esta migración NO modifica notas ni matrículas.
-- Agrega índices y dos RPC filtradas que calculan únicamente el
-- curso/trimestre o estudiante solicitado por el frontend.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. ÍNDICES DE APOYO
-- ---------------------------------------------------------------------

create index if not exists idx_enrollments_course_year_status
  on public.enrollments (course_id, academic_year_id, status);

create index if not exists idx_assessments_course_term_subject_active
  on public.assessments (course_id, term_id, subject_id, active);

create index if not exists idx_assessment_grades_assessment_enrollment
  on public.assessment_grades (assessment_id, enrollment_id);

create index if not exists idx_projects_course_term_status
  on public.interdisciplinary_projects (course_id, term_id, status);

create index if not exists idx_project_subjects_project_subject_active
  on public.project_subjects (project_id, subject_id, active);

create index if not exists idx_project_indicators_subject_active
  on public.project_indicators (project_subject_id, active);

create index if not exists idx_project_indicator_scores_enrollment_indicator
  on public.project_indicator_scores (enrollment_id, indicator_id);

create index if not exists idx_project_components_project_enrollment
  on public.project_student_components (project_id, enrollment_id);

-- ---------------------------------------------------------------------
-- 2. RESULTADOS DE UN CURSO / TRIMESTRE
-- ---------------------------------------------------------------------

create or replace function public.get_subject_term_results_v2(
  p_course_id uuid,
  p_term_id uuid,
  p_subject_id uuid default null,
  p_enrollment_id uuid default null
)
returns table (
  enrollment_id uuid,
  student_id uuid,
  academic_year_id uuid,
  course_id uuid,
  grade_level_id uuid,
  sublevel public.academic_sublevel,
  evaluation_model public.evaluation_model,
  subject_id uuid,
  term_id uuid,
  term_number smallint,
  total_items bigint,
  formative_items bigint,
  summative_items bigint,
  formative_average numeric,
  summative_average numeric,
  term_score numeric,
  qualitative text
)
language sql
stable
security definer
set search_path = public
as $$
with context as (
  select
    c.id as course_id,
    c.academic_year_id,
    c.grade_level_id,
    gl.sublevel,
    gl.evaluation_model,
    t.id as term_id,
    t.number as term_number
  from public.courses c
  join public.grade_levels gl
    on gl.id = c.grade_level_id
  join public.terms t
    on t.id = p_term_id
   and t.academic_year_id = c.academic_year_id
  where c.id = p_course_id
),
base as (
  select
    e.id as enrollment_id,
    e.student_id,
    ctx.academic_year_id,
    ctx.course_id,
    ctx.grade_level_id,
    ctx.sublevel,
    ctx.evaluation_model,
    gs.subject_id,
    ctx.term_id,
    ctx.term_number
  from context ctx
  join public.enrollments e
    on e.course_id = ctx.course_id
   and e.academic_year_id = ctx.academic_year_id
   and e.status in ('active'::public.enrollment_status, 'completed'::public.enrollment_status)
  join public.grade_subjects gs
    on gs.grade_level_id = ctx.grade_level_id
   and gs.active = true
  join public.subjects s
    on s.id = gs.subject_id
   and s.active = true
   and s.kind = 'quantitative'::public.subject_kind
  where (p_subject_id is null or gs.subject_id = p_subject_id)
    and (p_enrollment_id is null or e.id = p_enrollment_id)
),
ordinary_items as (
  select
    b.enrollment_id,
    b.subject_id,
    a.category,
    public.effective_assessment_score(
      ag.initial_score,
      ag.direct_improvement_score,
      ag.reinforcement_score,
      ag.reinforced_improvement_score
    ) as effective_score
  from base b
  join public.assessments a
    on a.academic_year_id = b.academic_year_id
   and a.course_id = b.course_id
   and a.term_id = b.term_id
   and a.subject_id = b.subject_id
   and a.active = true
  join public.assessment_grades ag
    on ag.assessment_id = a.id
   and ag.enrollment_id = b.enrollment_id
  where ag.initial_score is not null
),
project_indicator_agg as (
  select
    b.enrollment_id,
    b.subject_id,
    p.id as project_id,
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
  from base b
  join public.interdisciplinary_projects p
    on p.academic_year_id = b.academic_year_id
   and p.course_id = b.course_id
   and p.term_id = b.term_id
   and p.status <> 'draft'::public.project_status
  join public.project_subjects ps
    on ps.project_id = p.id
   and ps.subject_id = b.subject_id
   and ps.active = true
  left join public.project_indicators pi
    on pi.project_subject_id = ps.id
   and pi.active = true
  left join public.project_indicator_scores pis
    on pis.indicator_id = pi.id
   and pis.enrollment_id = b.enrollment_id
  group by
    b.enrollment_id,
    b.subject_id,
    p.id
),
project_items as (
  select
    pia.enrollment_id,
    pia.subject_id,
    'summative'::public.assessment_category as category,
    trunc(
      (pia.indicator_average + pc.product_score + pc.presentation_score) / 3.0,
      2
    ) as effective_score
  from project_indicator_agg pia
  join public.project_student_components pc
    on pc.project_id = pia.project_id
   and pc.enrollment_id = pia.enrollment_id
  where pia.expected_indicators > 0
    and pia.graded_indicators = pia.expected_indicators
    and pia.indicator_average is not null
    and pc.product_score is not null
    and pc.presentation_score is not null
),
items as (
  select enrollment_id, subject_id, category, effective_score
  from ordinary_items
  where effective_score is not null

  union all

  select enrollment_id, subject_id, category, effective_score
  from project_items
  where effective_score is not null
),
aggregated as (
  select
    b.enrollment_id,
    b.student_id,
    b.academic_year_id,
    b.course_id,
    b.grade_level_id,
    b.sublevel,
    b.evaluation_model,
    b.subject_id,
    b.term_id,
    b.term_number,

    count(i.effective_score) as total_items,

    count(i.effective_score)
      filter (where i.category = 'formative'::public.assessment_category)
      as formative_items,

    count(i.effective_score)
      filter (where i.category = 'summative'::public.assessment_category)
      as summative_items,

    avg(i.effective_score)
      filter (where i.category = 'formative'::public.assessment_category)
      as formative_average_raw,

    avg(i.effective_score)
      filter (where i.category = 'summative'::public.assessment_category)
      as summative_average_raw,

    avg(i.effective_score) as simple_average_raw

  from base b
  left join items i
    on i.enrollment_id = b.enrollment_id
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
),
calculated as (
  select
    a.*,

    case
      when a.formative_items > 0
        then trunc(a.formative_average_raw, 2)
      else null
    end as formative_average_calc,

    case
      when a.summative_items > 0
        then trunc(a.summative_average_raw, 2)
      else null
    end as summative_average_calc,

    case
      when a.evaluation_model = 'simple_average'::public.evaluation_model
       and a.total_items > 0
        then round(a.simple_average_raw, 2)

      when a.evaluation_model = 'weighted_70_30'::public.evaluation_model
       and a.formative_items > 0
       and a.summative_items > 0
        then trunc(
          (trunc(a.formative_average_raw, 2) * 0.70)
          +
          (trunc(a.summative_average_raw, 2) * 0.30),
          2
        )

      else null
    end as term_score_calc

  from aggregated a
)
select
  c.enrollment_id,
  c.student_id,
  c.academic_year_id,
  c.course_id,
  c.grade_level_id,
  c.sublevel,
  c.evaluation_model,
  c.subject_id,
  c.term_id,
  c.term_number,
  c.total_items,
  c.formative_items,
  c.summative_items,
  c.formative_average_calc,
  c.summative_average_calc,
  c.term_score_calc,
  public.qualitative_letter(c.term_score_calc)
from calculated c
order by c.enrollment_id, c.subject_id;
$$;

-- ---------------------------------------------------------------------
-- 3. RESULTADOS ANUALES DE UN ESTUDIANTE
-- ---------------------------------------------------------------------

create or replace function public.get_subject_annual_results_v2(
  p_enrollment_id uuid
)
returns table (
  enrollment_id uuid,
  student_id uuid,
  academic_year_id uuid,
  course_id uuid,
  grade_level_id uuid,
  sublevel public.academic_sublevel,
  evaluation_model public.evaluation_model,
  subject_id uuid,
  term_1 numeric,
  term_2 numeric,
  term_3 numeric,
  completed_terms bigint,
  annual_score numeric,
  qualitative text
)
language sql
stable
security definer
set search_path = public
as $$
with enrollment_context as (
  select
    e.id as enrollment_id,
    e.course_id,
    e.academic_year_id
  from public.enrollments e
  where e.id = p_enrollment_id
),
all_results as (
  select r.*
  from enrollment_context ec
  join public.terms t
    on t.academic_year_id = ec.academic_year_id
  cross join lateral public.get_subject_term_results_v2(
    ec.course_id,
    t.id,
    null,
    ec.enrollment_id
  ) r
),
pivoted as (
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

  from all_results r
  group by
    r.enrollment_id,
    r.student_id,
    r.academic_year_id,
    r.course_id,
    r.grade_level_id,
    r.sublevel,
    r.evaluation_model,
    r.subject_id
),
calculated as (
  select
    p.*,
    case
      when p.completed_terms = 3
       and p.evaluation_model = 'simple_average'::public.evaluation_model
        then round((p.term_1 + p.term_2 + p.term_3) / 3.0, 2)

      when p.completed_terms = 3
       and p.evaluation_model = 'weighted_70_30'::public.evaluation_model
        then trunc((p.term_1 + p.term_2 + p.term_3) / 3.0, 2)

      else null
    end as annual_score_calc
  from pivoted p
)
select
  c.enrollment_id,
  c.student_id,
  c.academic_year_id,
  c.course_id,
  c.grade_level_id,
  c.sublevel,
  c.evaluation_model,
  c.subject_id,
  c.term_1,
  c.term_2,
  c.term_3,
  c.completed_terms,
  c.annual_score_calc,
  public.qualitative_letter(c.annual_score_calc)
from calculated c
order by c.subject_id;
$$;

grant execute on function public.get_subject_term_results_v2(uuid, uuid, uuid, uuid)
to authenticated;

grant execute on function public.get_subject_annual_results_v2(uuid)
to authenticated;

commit;

-- ---------------------------------------------------------------------
-- PRUEBAS RÁPIDAS DESPUÉS DE APLICAR
-- ---------------------------------------------------------------------
-- 2DO A / T1 / todas las materias:
--
-- select *
-- from public.get_subject_term_results_v2(
--   (select c.id
--    from public.courses c
--    join public.academic_years ay on ay.id = c.academic_year_id
--    join public.grade_levels gl on gl.id = c.grade_level_id
--    where ay.name = '2026-2027'
--      and gl.code = '2EGB'
--      and c.parallel = 'A'
--    limit 1),
--   (select t.id
--    from public.terms t
--    join public.academic_years ay on ay.id = t.academic_year_id
--    where ay.name = '2026-2027'
--      and t.number = 1
--    limit 1),
--   null,
--   null
-- );
--
-- Esperado con el dataset TEST:
-- 25 estudiantes x 7 materias = 175 filas, con term_score calculado.
