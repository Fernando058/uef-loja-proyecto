import { CalendarRange, Layers3, Pencil, Plus, School, UserRoundCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  Course,
  GradeLevel,
  Subject,
  SubjectKind,
  Teacher,
  TeacherAssignment,
  Term,
} from '../types/domain'

type Tab = 'years' | 'courses' | 'subjects' | 'assignments'

interface YearDraft {
  name: string
  start_date: string
  end_date: string
  active: boolean
  closed: boolean
}

interface TermDraft {
  name: string
  start_date: string
  end_date: string
  closed: boolean
}

interface CourseDraft {
  academic_year_id: string
  grade_level_id: string
  parallel: string
  active: boolean
}

interface SubjectDraft {
  code: string
  name: string
  abbreviation: string
  kind: SubjectKind
  active: boolean
  sort_order: number
}

interface AssignmentDraft {
  academic_year_id: string
  course_id: string
  subject_id: string
  teacher_id: string
  active: boolean
}

const emptyYear: YearDraft = { name: '', start_date: '', end_date: '', active: true, closed: false }
const emptyTerm: TermDraft = { name: '', start_date: '', end_date: '', closed: false }
const emptyCourse: CourseDraft = { academic_year_id: '', grade_level_id: '', parallel: 'A', active: true }
const emptySubject: SubjectDraft = { code: '', name: '', abbreviation: '', kind: 'quantitative', active: true, sort_order: 100 }
const emptyAssignment: AssignmentDraft = { academic_year_id: '', course_id: '', subject_id: '', teacher_id: '', active: true }

export function ConfigurationPage() {
  const [tab, setTab] = useState<Tab>('years')
  const [years, setYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [notice, setNotice] = useState('')

  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null)
  const [editingTerm, setEditingTerm] = useState<Term | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | null>(null)

  const [yearOpen, setYearOpen] = useState(false)
  const [termOpen, setTermOpen] = useState(false)
  const [courseOpen, setCourseOpen] = useState(false)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)

  const [yearDraft, setYearDraft] = useState<YearDraft>(emptyYear)
  const [termDraft, setTermDraft] = useState<TermDraft>(emptyTerm)
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(emptyCourse)
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft>(emptySubject)
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>(emptyAssignment)

  const load = useCallback(async () => {
    const [yearRes, termRes, gradeRes, courseRes, subjectRes, teacherRes, assignmentRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
      supabase.from('terms').select('*').order('number'),
      supabase.from('grade_levels').select('*').eq('active', true).order('ordinal'),
      supabase.from('courses').select('*,grade_level:grade_levels(*)'),
      supabase.from('subjects').select('*').order('sort_order').order('name'),
      supabase.from('teachers').select('*').order('last_names').order('first_names'),
      supabase.from('teacher_assignments').select('*,course:courses(*,grade_level:grade_levels(*)),subject:subjects(*),teacher:teachers(*)').order('created_at', { ascending: false }),
    ])

    const firstError = [yearRes, termRes, gradeRes, courseRes, subjectRes, teacherRes, assignmentRes].find((item) => item.error)?.error
    if (firstError) throw firstError

    const courseRows = ((courseRes.data ?? []) as Course[]).sort((a, b) => {
      const ordinal = (a.grade_level?.ordinal ?? 99) - (b.grade_level?.ordinal ?? 99)
      return ordinal || a.parallel.localeCompare(b.parallel, 'es')
    })

    setYears((yearRes.data ?? []) as AcademicYear[])
    setTerms((termRes.data ?? []) as Term[])
    setGradeLevels((gradeRes.data ?? []) as GradeLevel[])
    setCourses(courseRows)
    setSubjects((subjectRes.data ?? []) as Subject[])
    setTeachers((teacherRes.data ?? []) as Teacher[])
    setAssignments((assignmentRes.data ?? []) as TeacherAssignment[])
  }, [])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const activeYear = years.find((year) => year.active) ?? years[0]
  const selectedYearCourses = useMemo(
    () => courses.filter((course) => course.academic_year_id === assignmentDraft.academic_year_id && course.active),
    [courses, assignmentDraft.academic_year_id],
  )

  const saveYear = async () => {
    if (!yearDraft.name.trim()) {
      setNotice('Escriba el nombre del año lectivo.')
      return
    }
    if (yearDraft.start_date && yearDraft.end_date && yearDraft.end_date < yearDraft.start_date) {
      setNotice('La fecha final no puede ser anterior a la fecha inicial.')
      return
    }

    if (yearDraft.active) {
      let query = supabase.from('academic_years').update({ active: false }).eq('active', true)
      if (editingYear) query = query.neq('id', editingYear.id)
      const { error } = await query
      if (error) throw error
    }

    const payload = {
      name: yearDraft.name.trim(),
      start_date: yearDraft.start_date || null,
      end_date: yearDraft.end_date || null,
      active: yearDraft.active,
      closed: yearDraft.closed,
    }

    if (editingYear) {
      const { error } = await supabase.from('academic_years').update(payload).eq('id', editingYear.id)
      if (error) throw error
      setNotice('Año lectivo actualizado.')
    } else {
      const { data, error } = await supabase.from('academic_years').insert(payload).select('id').single()
      if (error) throw error
      const { error: termError } = await supabase.from('terms').insert([
        { academic_year_id: data.id, number: 1, name: 'Trimestre 1' },
        { academic_year_id: data.id, number: 2, name: 'Trimestre 2' },
        { academic_year_id: data.id, number: 3, name: 'Trimestre 3' },
      ])
      if (termError) throw termError
      setNotice('Año lectivo creado con sus tres trimestres.')
    }

    setYearOpen(false)
    await load()
  }

  const saveTerm = async () => {
    if (!editingTerm || !termDraft.name.trim()) return
    const { error } = await supabase.from('terms').update({
      name: termDraft.name.trim(),
      start_date: termDraft.start_date || null,
      end_date: termDraft.end_date || null,
      closed: termDraft.closed,
    }).eq('id', editingTerm.id)
    if (error) throw error
    setTermOpen(false)
    setNotice('Trimestre actualizado.')
    await load()
  }

  const saveCourse = async () => {
    if (!courseDraft.academic_year_id || !courseDraft.grade_level_id || !courseDraft.parallel.trim()) {
      setNotice('Complete año lectivo, grado y paralelo.')
      return
    }
    const payload = {
      academic_year_id: courseDraft.academic_year_id,
      grade_level_id: courseDraft.grade_level_id,
      parallel: courseDraft.parallel.trim().toUpperCase(),
      active: courseDraft.active,
    }
    const query = editingCourse
      ? supabase.from('courses').update(payload).eq('id', editingCourse.id)
      : supabase.from('courses').insert(payload)
    const { error } = await query
    if (error) throw error
    setCourseOpen(false)
    setNotice(editingCourse ? 'Curso actualizado.' : 'Curso creado.')
    await load()
  }

  const saveSubject = async () => {
    if (!subjectDraft.code.trim() || !subjectDraft.name.trim() || !subjectDraft.abbreviation.trim()) {
      setNotice('Complete código, nombre y abreviatura de la asignatura.')
      return
    }
    const payload = {
      code: subjectDraft.code.trim().toUpperCase(),
      name: subjectDraft.name.trim(),
      abbreviation: subjectDraft.abbreviation.trim().toUpperCase(),
      kind: subjectDraft.kind,
      active: subjectDraft.active,
      sort_order: Number(subjectDraft.sort_order) || 100,
    }
    const query = editingSubject
      ? supabase.from('subjects').update(payload).eq('id', editingSubject.id)
      : supabase.from('subjects').insert(payload)
    const { data, error } = await query.select('id').single()
    if (error) throw error

    if (!editingSubject && data?.id) {
      const { error: relationError } = await supabase.from('grade_subjects').insert(
        gradeLevels.map((grade) => ({ grade_level_id: grade.id, subject_id: data.id, required: true, active: true })),
      )
      if (relationError) throw relationError
    }

    setSubjectOpen(false)
    setNotice(editingSubject ? 'Asignatura actualizada.' : 'Asignatura creada y habilitada para los grados configurados.')
    await load()
  }

  const saveAssignment = async () => {
    if (!assignmentDraft.academic_year_id || !assignmentDraft.course_id || !assignmentDraft.subject_id || !assignmentDraft.teacher_id) {
      setNotice('Complete todos los datos de la asignación.')
      return
    }
    const payload = { ...assignmentDraft }
    const query = editingAssignment
      ? supabase.from('teacher_assignments').update(payload).eq('id', editingAssignment.id)
      : supabase.from('teacher_assignments').insert(payload)
    const { error } = await query
    if (error) throw error
    setAssignmentOpen(false)
    setNotice(editingAssignment ? 'Asignación actualizada.' : 'Asignación docente creada.')
    await load()
  }

  const openYearCreate = () => {
    setEditingYear(null)
    setYearDraft(emptyYear)
    setYearOpen(true)
  }

  const openCourseCreate = () => {
    setEditingCourse(null)
    setCourseDraft({ ...emptyCourse, academic_year_id: activeYear?.id ?? '', grade_level_id: gradeLevels[0]?.id ?? '' })
    setCourseOpen(true)
  }

  const openSubjectCreate = () => {
    setEditingSubject(null)
    setSubjectDraft({ ...emptySubject, sort_order: subjects.length ? Math.max(...subjects.map((item) => item.sort_order)) + 10 : 10 })
    setSubjectOpen(true)
  }

  const openAssignmentCreate = () => {
    const yearId = activeYear?.id ?? ''
    const course = courses.find((item) => item.academic_year_id === yearId && item.active)
    setEditingAssignment(null)
    setAssignmentDraft({ ...emptyAssignment, academic_year_id: yearId, course_id: course?.id ?? '' })
    setAssignmentOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Configuración académica V2"
        description="Configure periodos, cursos, asignaturas y responsables. El modelo de evaluación se determina automáticamente por subnivel."
      />
      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="tabs">
        <button className={tab === 'years' ? 'tab active' : 'tab'} onClick={() => setTab('years')}><CalendarRange size={17} /> Años y trimestres</button>
        <button className={tab === 'courses' ? 'tab active' : 'tab'} onClick={() => setTab('courses')}><School size={17} /> Cursos</button>
        <button className={tab === 'subjects' ? 'tab active' : 'tab'} onClick={() => setTab('subjects')}><Layers3 size={17} /> Asignaturas</button>
        <button className={tab === 'assignments' ? 'tab active' : 'tab'} onClick={() => setTab('assignments')}><UserRoundCheck size={17} /> Asignaciones</button>
      </div>

      {tab === 'years' && <section className="panel">
        <div className="panel-heading"><div><h2>Años lectivos</h2><p>Al crear un año se generan automáticamente los tres trimestres.</p></div><button className="button button-primary" onClick={openYearCreate}><Plus size={17} /> Nuevo año</button></div>
        <div className="cards-list">
          {years.map((year) => (
            <article className="config-card" key={year.id}>
              <div><h3>{year.name} {year.active && <span className="badge badge-success">Activo</span>} {year.closed && <span className="badge badge-muted">Cerrado</span>}</h3><p>{year.start_date || 'Sin fecha'} — {year.end_date || 'Sin fecha'}</p><button className="button button-light button-small" onClick={() => { setEditingYear(year); setYearDraft({ name: year.name, start_date: year.start_date ?? '', end_date: year.end_date ?? '', active: year.active, closed: year.closed }); setYearOpen(true) }}><Pencil size={14} /> Editar año</button></div>
              <div className="term-list">{terms.filter((term) => term.academic_year_id === year.id).sort((a, b) => a.number - b.number).map((term) => <button key={term.id} className={`term-chip ${term.closed ? 'closed' : ''}`} onClick={() => { setEditingTerm(term); setTermDraft({ name: term.name, start_date: term.start_date ?? '', end_date: term.end_date ?? '', closed: term.closed }); setTermOpen(true) }}>{term.name}{term.closed ? ' · cerrado' : ''}</button>)}</div>
            </article>
          ))}
          {!years.length && <div className="empty-cell">Todavía no existe un año lectivo.</div>}
        </div>
      </section>}

      {tab === 'courses' && <section className="panel">
        <div className="panel-heading"><div><h2>Cursos y paralelos</h2><p>El subnivel y la regla de cálculo se heredan del grado seleccionado.</p></div><button className="button button-primary" onClick={openCourseCreate}><Plus size={17} /> Nuevo curso</button></div>
        <div className="table-wrap"><table><thead><tr><th>Año</th><th>Grado</th><th>Subnivel</th><th>Modelo</th><th>Paralelo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          {courses.map((course) => <tr key={course.id}><td>{years.find((year) => year.id === course.academic_year_id)?.name ?? '—'}</td><td><strong>{course.grade_level?.name ?? '—'}</strong></td><td>{course.grade_level?.sublevel === 'elemental' ? 'Elemental' : 'Media'}</td><td><span className="badge badge-primary">{course.grade_level?.evaluation_model === 'simple_average' ? 'Promedio simple' : '70 % / 30 %'}</span></td><td>{course.parallel}</td><td><span className={`badge ${course.active ? 'badge-success' : 'badge-muted'}`}>{course.active ? 'Activo' : 'Inactivo'}</span></td><td><button className="button button-light button-small" onClick={() => { setEditingCourse(course); setCourseDraft({ academic_year_id: course.academic_year_id, grade_level_id: course.grade_level_id, parallel: course.parallel, active: course.active }); setCourseOpen(true) }}><Pencil size={14} /> Editar</button></td></tr>)}
          {!courses.length && <tr><td colSpan={7} className="empty-cell">No existen cursos.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab === 'subjects' && <section className="panel">
        <div className="panel-heading"><div><h2>Asignaturas</h2><p>Las cuantitativas alimentan los promedios. Las cualitativas se tratarán de forma independiente.</p></div><button className="button button-primary" onClick={openSubjectCreate}><Plus size={17} /> Nueva asignatura</button></div>
        <div className="table-wrap"><table><thead><tr><th>Orden</th><th>Código</th><th>Asignatura</th><th>Abrev.</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          {subjects.map((subject) => <tr key={subject.id}><td>{subject.sort_order}</td><td>{subject.code}</td><td><strong>{subject.name}</strong></td><td>{subject.abbreviation}</td><td><span className={`badge ${subject.kind === 'quantitative' ? 'badge-primary' : 'badge-warning'}`}>{subject.kind === 'quantitative' ? 'Cuantitativa' : 'Cualitativa'}</span></td><td><span className={`badge ${subject.active ? 'badge-success' : 'badge-muted'}`}>{subject.active ? 'Activa' : 'Inactiva'}</span></td><td><button className="button button-light button-small" onClick={() => { setEditingSubject(subject); setSubjectDraft({ code: subject.code, name: subject.name, abbreviation: subject.abbreviation, kind: subject.kind, active: subject.active, sort_order: subject.sort_order }); setSubjectOpen(true) }}><Pencil size={14} /> Editar</button></td></tr>)}
        </tbody></table></div>
      </section>}

      {tab === 'assignments' && <section className="panel">
        <div className="panel-heading"><div><h2>Asignaciones docentes</h2><p>Vincule una asignatura de un curso con el docente responsable.</p></div><button className="button button-primary" onClick={openAssignmentCreate}><Plus size={17} /> Nueva asignación</button></div>
        <div className="table-wrap"><table><thead><tr><th>Año</th><th>Curso</th><th>Asignatura</th><th>Docente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          {assignments.map((assignment) => <tr key={assignment.id}><td>{years.find((year) => year.id === assignment.academic_year_id)?.name ?? '—'}</td><td>{assignment.course?.grade_level?.name ?? '—'} “{assignment.course?.parallel ?? ''}”</td><td>{assignment.subject?.name ?? '—'}</td><td>{fullName(assignment.teacher?.first_names, assignment.teacher?.last_names)}</td><td><span className={`badge ${assignment.active ? 'badge-success' : 'badge-muted'}`}>{assignment.active ? 'Activa' : 'Inactiva'}</span></td><td><button className="button button-light button-small" onClick={() => { setEditingAssignment(assignment); setAssignmentDraft({ academic_year_id: assignment.academic_year_id, course_id: assignment.course_id, subject_id: assignment.subject_id, teacher_id: assignment.teacher_id, active: assignment.active }); setAssignmentOpen(true) }}><Pencil size={14} /> Editar</button></td></tr>)}
          {!assignments.length && <tr><td colSpan={6} className="empty-cell">No existen asignaciones docentes.</td></tr>}
        </tbody></table></div>
      </section>}

      <Modal open={yearOpen} title={editingYear ? 'Editar año lectivo' : 'Nuevo año lectivo'} onClose={() => setYearOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Nombre *</span><input value={yearDraft.name} onChange={(event) => setYearDraft({ ...yearDraft, name: event.target.value })} placeholder="2026-2027" /></label>
          <label className="field"><span>Fecha inicial</span><input type="date" value={yearDraft.start_date} onChange={(event) => setYearDraft({ ...yearDraft, start_date: event.target.value })} /></label>
          <label className="field"><span>Fecha final</span><input type="date" value={yearDraft.end_date} onChange={(event) => setYearDraft({ ...yearDraft, end_date: event.target.value })} /></label>
          <label className="check-field"><input type="checkbox" checked={yearDraft.active} onChange={(event) => setYearDraft({ ...yearDraft, active: event.target.checked })} /><span>Año activo</span></label>
          <label className="check-field"><input type="checkbox" checked={yearDraft.closed} onChange={(event) => setYearDraft({ ...yearDraft, closed: event.target.checked })} /><span>Año cerrado</span></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setYearOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveYear().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div>
        </div>
      </Modal>

      <Modal open={termOpen} title={`Editar ${editingTerm?.name ?? 'trimestre'}`} onClose={() => setTermOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Nombre</span><input value={termDraft.name} onChange={(event) => setTermDraft({ ...termDraft, name: event.target.value })} /></label>
          <label className="field"><span>Fecha inicial</span><input type="date" value={termDraft.start_date} onChange={(event) => setTermDraft({ ...termDraft, start_date: event.target.value })} /></label>
          <label className="field"><span>Fecha final</span><input type="date" value={termDraft.end_date} onChange={(event) => setTermDraft({ ...termDraft, end_date: event.target.value })} /></label>
          <label className="check-field full-span"><input type="checkbox" checked={termDraft.closed} onChange={(event) => setTermDraft({ ...termDraft, closed: event.target.checked })} /><span>Trimestre cerrado</span></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setTermOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveTerm().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div>
        </div>
      </Modal>

      <Modal open={courseOpen} title={editingCourse ? 'Editar curso' : 'Nuevo curso'} onClose={() => setCourseOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Año lectivo</span><select value={courseDraft.academic_year_id} onChange={(event) => setCourseDraft({ ...courseDraft, academic_year_id: event.target.value })}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label className="field"><span>Grado</span><select value={courseDraft.grade_level_id} onChange={(event) => setCourseDraft({ ...courseDraft, grade_level_id: event.target.value })}>{gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name} · {grade.evaluation_model === 'simple_average' ? 'promedio simple' : '70/30'}</option>)}</select></label>
          <label className="field"><span>Paralelo</span><input value={courseDraft.parallel} onChange={(event) => setCourseDraft({ ...courseDraft, parallel: event.target.value })} /></label>
          <label className="check-field full-span"><input type="checkbox" checked={courseDraft.active} onChange={(event) => setCourseDraft({ ...courseDraft, active: event.target.checked })} /><span>Curso activo</span></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setCourseOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveCourse().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div>
        </div>
      </Modal>

      <Modal open={subjectOpen} title={editingSubject ? 'Editar asignatura' : 'Nueva asignatura'} onClose={() => setSubjectOpen(false)}>
        <div className="form-grid">
          <label className="field"><span>Código</span><input value={subjectDraft.code} onChange={(event) => setSubjectDraft({ ...subjectDraft, code: event.target.value })} /></label>
          <label className="field"><span>Abreviatura</span><input value={subjectDraft.abbreviation} onChange={(event) => setSubjectDraft({ ...subjectDraft, abbreviation: event.target.value })} /></label>
          <label className="field full-span"><span>Nombre</span><input value={subjectDraft.name} onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })} /></label>
          <label className="field"><span>Tipo</span><select value={subjectDraft.kind} onChange={(event) => setSubjectDraft({ ...subjectDraft, kind: event.target.value as SubjectKind })}><option value="quantitative">Cuantitativa</option><option value="qualitative">Cualitativa</option></select></label>
          <label className="field"><span>Orden</span><input type="number" min="1" value={subjectDraft.sort_order} onChange={(event) => setSubjectDraft({ ...subjectDraft, sort_order: Number(event.target.value) })} /></label>
          <label className="check-field full-span"><input type="checkbox" checked={subjectDraft.active} onChange={(event) => setSubjectDraft({ ...subjectDraft, active: event.target.checked })} /><span>Asignatura activa</span></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setSubjectOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveSubject().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div>
        </div>
      </Modal>

      <Modal open={assignmentOpen} title={editingAssignment ? 'Editar asignación' : 'Nueva asignación'} onClose={() => setAssignmentOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Año lectivo</span><select value={assignmentDraft.academic_year_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, academic_year_id: event.target.value, course_id: '' })}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label className="field full-span"><span>Curso</span><select value={assignmentDraft.course_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, course_id: event.target.value })}><option value="">Seleccione</option>{selectedYearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level?.name} “{course.parallel}”</option>)}</select></label>
          <label className="field"><span>Asignatura</span><select value={assignmentDraft.subject_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, subject_id: event.target.value })}><option value="">Seleccione</option>{subjects.filter((subject) => subject.active).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="field"><span>Docente</span><select value={assignmentDraft.teacher_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, teacher_id: event.target.value })}><option value="">Seleccione</option>{teachers.filter((teacher) => teacher.active).map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher.first_names, teacher.last_names)}</option>)}</select></label>
          <label className="check-field full-span"><input type="checkbox" checked={assignmentDraft.active} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, active: event.target.checked })} /><span>Asignación activa</span></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setAssignmentOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveAssignment().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div>
        </div>
      </Modal>
    </>
  )
}
