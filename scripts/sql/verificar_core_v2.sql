-- ============================================================
-- VERIFICACIÓN DEL NÚCLEO V2 - UEF LOJA
-- ============================================================

-- 1. Usuario maestro.
select id, email, first_names, last_names, role, active
from public.profiles
where lower(email) = lower('fcardenas058@gmail.com');

-- 2. Grados y modelo normativo.
select
  code,
  name,
  sublevel,
  evaluation_model,
  active
from public.grade_levels
order by ordinal;

-- 3. Asignaturas.
select code, name, abbreviation, kind, active
from public.subjects
order by sort_order;

-- 4. Relación de materias por grado.
select
  g.name as grado,
  count(*) filter (where s.kind = 'quantitative') as cuantitativas,
  count(*) filter (where s.kind = 'qualitative') as cualitativas
from public.grade_subjects gs
join public.grade_levels g on g.id = gs.grade_level_id
join public.subjects s on s.id = gs.subject_id
where gs.active = true
group by g.id, g.name, g.ordinal
order by g.ordinal;

-- 5. Tablas núcleo.
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
