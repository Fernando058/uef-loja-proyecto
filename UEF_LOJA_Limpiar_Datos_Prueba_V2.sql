-- ============================================================
-- UEF LOJA - LIMPIEZA DE DATOS FICTICIOS V2
-- Elimina únicamente datos generados por
-- UEF_LOJA_Datos_Prueba_Integrales_V2_2026_2027.sql
--
-- NO elimina:
--   * usuario maestro / auth.users
--   * perfiles reales
--   * catálogo de grados
--   * catálogo de asignaturas
--   * catálogo de actividades
--   * migraciones
-- ============================================================

begin;

-- Supletorios ficticios
delete from public.supplementary_exams se
using public.enrollments e, public.students s
where se.enrollment_id = e.id
  and e.student_id = s.id
  and s.national_id like 'TEST-%';

-- Proyectos ficticios (cascade elimina materias, indicadores y componentes)
delete from public.interdisciplinary_projects
where name like '[PRUEBA V2]%';

-- Evaluaciones ficticias (cascade elimina calificaciones)
delete from public.assessments
where title like '[PRUEBA V2]%';

-- Matrículas ficticias
delete from public.enrollments e
using public.students s
where e.student_id = s.id
  and s.national_id like 'TEST-%';

-- Estudiantes ficticios
delete from public.students
where national_id like 'TEST-%';

-- Asignaciones de docentes ficticios
delete from public.teacher_assignments ta
using public.teachers t
where ta.teacher_id = t.id
  and t.national_id like 'DOC-TEST-%';

-- Docentes ficticios
delete from public.teachers
where national_id like 'DOC-TEST-%';

-- Cursos del año de prueba.
-- Solo se eliminan si ya no tienen matrículas/asignaciones dependientes.
delete from public.courses c
using public.academic_years ay
where c.academic_year_id = ay.id
  and lower(ay.name) = lower('2026-2027')
  and not exists (
    select 1 from public.enrollments e where e.course_id = c.id
  )
  and not exists (
    select 1 from public.teacher_assignments ta where ta.course_id = c.id
  );

-- Trimestres y año se conservan intencionalmente.
-- Si también deseas eliminarlos, hazlo manualmente después de confirmar.

commit;
