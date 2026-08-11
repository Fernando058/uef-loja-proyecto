-- =====================================================================
-- VERIFICACIÓN FASE 3 - MOTOR DE EVALUACIÓN V2
-- =====================================================================

-- 1. Tablas nuevas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'assessment_activity_types',
    'interdisciplinary_projects',
    'project_subjects',
    'project_indicators',
    'project_indicator_scores',
    'project_student_components',
    'assessments',
    'assessment_grades',
    'grade_audit_log',
    'supplementary_exams'
  )
order by table_name;

-- Debe devolver 10 tablas.

-- 2. Vistas del motor.
select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'v_project_subject_scores',
    'v_assessment_effective_grades',
    'v_evaluation_score_items',
    'v_subject_term_results',
    'v_subject_annual_results',
    'v_supplementary_eligibility'
  )
order by table_name;

-- Debe devolver 6 vistas.

-- 3. Actividades precargadas.
select code, name, default_category, active
from public.assessment_activity_types
order by sort_order;

-- 4. Prueba de equivalencia cualitativa.
select
  public.qualitative_letter(9.50) as "9.50",
  public.qualitative_letter(9.49) as "9.49",
  public.qualitative_letter(8.50) as "8.50",
  public.qualitative_letter(7.50) as "7.50",
  public.qualitative_letter(6.50) as "6.50";

-- Esperado:
-- 9.50=A+ | 9.49=A- | 8.50=A- | 7.50=B+ | 6.50=B-

-- 5. Prueba matemática de mejora directa.
select public.effective_assessment_score(
  7.15, 8.00, null, null
) as mejora_directa;

-- Esperado: 7.57

-- 6. Prueba matemática de mejora con refuerzo.
select public.effective_assessment_score(
  6.40, null, 8.00, 8.00
) as mejora_con_refuerzo;

-- Esperado: 7.46

-- 7. Confirmar modelos por grado.
select code, name, sublevel, evaluation_model
from public.grade_levels
order by ordinal;
