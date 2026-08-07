import { CalendarRange, Layers3, Pencil, Plus, School, Sparkles, UserRoundCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  BehaviorCatalogItem,
  Course,
  QualitativeArea,
  Subject,
  Teacher,
  TeacherAssignment,
  Term,
} from '../types/domain'

type Tab = 'years' | 'courses' | 'subjects' | 'assignments' | 'qualitative'

type BehaviorLetter = BehaviorCatalogItem['letter']

interface YearDraft {
  name: string
  starts_on: string
  ends_on: string
  active: boolean
  closed: boolean
}

interface TermDraft {
  name: string
  starts_on: string
  ends_on: string
  closed: boolean
}

interface CourseDraft {
  academic_year_id: string
  grade_level: string
  parallel: string
  active: boolean
}

interface SubjectDraft {
  name: string
  short_name: string
  active: boolean
}

interface AssignmentDraft {
  academic_year_id: string
  course_id: string
  subject_id: string
  teacher_id: string
  active: boolean
}

interface AreaDraft {
  name: string
  short_name: string
  sort_order: number
  active: boolean
}

const emptyYear: YearDraft = { name: '', starts_on: '', ends_on: '', active: true, closed: false }
const emptyTerm: TermDraft = { name: '', starts_on: '', ends_on: '', closed: false }
const emptyCourse: CourseDraft = { academic_year_id: '', grade_level: '', parallel: 'A', active: true }
const emptySubject: SubjectDraft = { name: '', short_name: '', active: true }
const emptyAssignment: AssignmentDraft = { academic_year_id: '', course_id: '', subject_id: '', teacher_id: '', active: true }
const emptyArea: AreaDraft = { name: '', short_name: '', sort_order: 1, active: true }

export function ConfigurationPage() {
  const [tab, setTab] = useState<Tab>('years')
  const [years, setYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [areas, setAreas] = useState<QualitativeArea[]>([])
  const [behaviorCatalog, setBehaviorCatalog] = useState<BehaviorCatalogItem[]>([])
  const [notice, setNotice] = useState('')

  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null)
  const [editingTerm, setEditingTerm] = useState<Term | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | null>(null)
  const [editingArea, setEditingArea] = useState<QualitativeArea | null>(null)
  const [editingBehavior, setEditingBehavior] = useState<BehaviorCatalogItem | null>(null)

  const [yearOpen, setYearOpen] = useState(false)
  const [termOpen, setTermOpen] = useState(false)
  const [courseOpen, setCourseOpen] = useState(false)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [areaOpen, setAreaOpen] = useState(false)
  const [behaviorOpen, setBehaviorOpen] = useState(false)

  const [yearDraft, setYearDraft] = useState<YearDraft>(emptyYear)
  const [termDraft, setTermDraft] = useState<TermDraft>(emptyTerm)
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(emptyCourse)
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft>(emptySubject)
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>(emptyAssignment)
  const [areaDraft, setAreaDraft] = useState<AreaDraft>(emptyArea)
  const [behaviorDescription, setBehaviorDescription] = useState('')
  const [behaviorActive, setBehaviorActive] = useState(true)

  const load = useCallback(async () => {
    const [yearRes, termRes, courseRes, subjectRes, teacherRes, assignmentRes, areaRes, behaviorRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('starts_on', { ascending: false }),
      supabase.from('terms').select('*').order('order_no'),
      supabase.from('courses').select('*').order('grade_level').order('parallel'),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('teachers').select('*').order('last_names'),
      supabase.from('teacher_assignments').select('*,course:courses(*),subject:subjects(*),teacher:teachers(*)').order('created_at', { ascending: false }),
      supabase.from('qualitative_areas').select('*').order('sort_order').order('name'),
      supabase.from('behavior_catalog').select('*').order('letter'),
    ])

    const firstError = [yearRes, termRes, courseRes, subjectRes, teacherRes, assignmentRes, areaRes, behaviorRes].find((item) => item.error)?.error
    if (firstError) throw firstError

    setYears((yearRes.data ?? []) as AcademicYear[])
    setTerms((termRes.data ?? []) as Term[])
    setCourses((courseRes.data ?? []) as Course[])
    setSubjects((subjectRes.data ?? []) as Subject[])
    setTeachers((teacherRes.data ?? []) as Teacher[])
    setAssignments((assignmentRes.data ?? []) as TeacherAssignment[])
    setAreas((areaRes.data ?? []) as QualitativeArea[])
    setBehaviorCatalog((behaviorRes.data ?? []) as BehaviorCatalogItem[])
  }, [])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const activeYear = years.find((year) => year.active) ?? years[0]
  const selectedYearCourses = useMemo(
    () => courses.filter((course) => course.academic_year_id === assignmentDraft.academic_year_id),
    [courses, assignmentDraft.academic_year_id],
  )

  const saveYear = async () => {
    if (!yearDraft.name.trim() || !yearDraft.starts_on || !yearDraft.ends_on) {
      setNotice('Complete el nombre y las fechas del año lectivo.')
      return
    }
    if (yearDraft.active) {
      let deactivateQuery = supabase.from('academic_years').update({ active: false }).eq('active', true)
      if (editingYear) deactivateQuery = deactivateQuery.neq('id', editingYear.id)
      const { error: deactivateError } = await deactivateQuery
      if (deactivateError) throw deactivateError
    }

    if (editingYear) {
      const { error } = await supabase.from('academic_years').update({ ...yearDraft, name: yearDraft.name.trim() }).eq('id', editingYear.id)
      if (error) throw error
      setNotice('Año lectivo actualizado.')
    } else {
      const { data, error } = await supabase.from('academic_years').insert({ ...yearDraft, name: yearDraft.name.trim() }).select('id').single()
      if (error) throw error
      const { error: termError } = await supabase.from('terms').insert([
        { academic_year_id: data.id, name: 'Trimestre 1', order_no: 1 },
        { academic_year_id: data.id, name: 'Trimestre 2', order_no: 2 },
        { academic_year_id: data.id, name: 'Trimestre 3', order_no: 3 },
      ])
      if (termError) throw termError
      setNotice('Año lectivo y sus tres trimestres creados.')
    }
    setYearOpen(false)
    await load()
  }

  const saveTerm = async () => {
    if (!editingTerm || !termDraft.name.trim()) return
    const { error } = await supabase.from('terms').update({
      name: termDraft.name.trim(),
      starts_on: termDraft.starts_on || null,
      ends_on: termDraft.ends_on || null,
      closed: termDraft.closed,
    }).eq('id', editingTerm.id)
    if (error) throw error
    setTermOpen(false)
    setNotice('Trimestre actualizado.')
    await load()
  }

  const saveCourse = async () => {
    if (!courseDraft.academic_year_id || !courseDraft.grade_level.trim() || !courseDraft.parallel.trim()) {
      setNotice('Complete el año, grado y paralelo.')
      return
    }
    const payload = {
      ...courseDraft,
      grade_level: courseDraft.grade_level.trim(),
      parallel: courseDraft.parallel.trim().toUpperCase(),
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
    if (!subjectDraft.name.trim()) {
      setNotice('Escriba el nombre de la materia.')
      return
    }
    const payload = { name: subjectDraft.name.trim(), short_name: subjectDraft.short_name.trim() || null, active: subjectDraft.active }
    const query = editingSubject
      ? supabase.from('subjects').update(payload).eq('id', editingSubject.id)
      : supabase.from('subjects').insert(payload)
    const { error } = await query
    if (error) throw error
    setSubjectOpen(false)
    setNotice(editingSubject ? 'Materia actualizada.' : 'Materia creada.')
    await load()
  }

  const saveAssignment = async () => {
    if (!assignmentDraft.academic_year_id || !assignmentDraft.course_id || !assignmentDraft.subject_id || !assignmentDraft.teacher_id) {
      setNotice('Complete todos los datos de la asignación.')
      return
    }
    const query = editingAssignment
      ? supabase.from('teacher_assignments').update(assignmentDraft).eq('id', editingAssignment.id)
      : supabase.from('teacher_assignments').insert(assignmentDraft)
    const { error } = await query
    if (error) throw error
    setAssignmentOpen(false)
    setNotice(editingAssignment ? 'Asignación actualizada.' : 'Asignación creada.')
    await load()
  }

  const saveArea = async () => {
    if (!areaDraft.name.trim()) return
    const payload = { ...areaDraft, name: areaDraft.name.trim(), short_name: areaDraft.short_name.trim() || null }
    const query = editingArea
      ? supabase.from('qualitative_areas').update(payload).eq('id', editingArea.id)
      : supabase.from('qualitative_areas').insert(payload)
    const { error } = await query
    if (error) throw error
    setAreaOpen(false)
    setNotice(editingArea ? 'Área cualitativa actualizada.' : 'Área cualitativa creada.')
    await load()
  }

  const saveBehavior = async () => {
    if (!editingBehavior || !behaviorDescription.trim()) return
    const { error } = await supabase.from('behavior_catalog').update({ description: behaviorDescription.trim(), active: behaviorActive }).eq('letter', editingBehavior.letter)
    if (error) throw error
    setBehaviorOpen(false)
    setNotice('Descripción de comportamiento actualizada.')
    await load()
  }

  const openYearCreate = () => { setEditingYear(null); setYearDraft(emptyYear); setYearOpen(true) }
  const openYearEdit = (year: AcademicYear) => { setEditingYear(year); setYearDraft({ name: year.name, starts_on: year.starts_on, ends_on: year.ends_on, active: year.active, closed: year.closed }); setYearOpen(true) }
  const openTermEdit = (term: Term) => { setEditingTerm(term); setTermDraft({ name: term.name, starts_on: term.starts_on ?? '', ends_on: term.ends_on ?? '', closed: term.closed }); setTermOpen(true) }
  const openCourseCreate = () => { setEditingCourse(null); setCourseDraft({ ...emptyCourse, academic_year_id: activeYear?.id ?? '' }); setCourseOpen(true) }
  const openCourseEdit = (course: Course) => { setEditingCourse(course); setCourseDraft({ academic_year_id: course.academic_year_id, grade_level: course.grade_level, parallel: course.parallel, active: course.active }); setCourseOpen(true) }
  const openSubjectCreate = () => { setEditingSubject(null); setSubjectDraft(emptySubject); setSubjectOpen(true) }
  const openSubjectEdit = (subject: Subject) => { setEditingSubject(subject); setSubjectDraft({ name: subject.name, short_name: subject.short_name ?? '', active: subject.active }); setSubjectOpen(true) }
  const openAssignmentCreate = () => { setEditingAssignment(null); setAssignmentDraft({ ...emptyAssignment, academic_year_id: activeYear?.id ?? '' }); setAssignmentOpen(true) }
  const openAssignmentEdit = (item: TeacherAssignment) => { setEditingAssignment(item); setAssignmentDraft({ academic_year_id: item.academic_year_id, course_id: item.course_id, subject_id: item.subject_id, teacher_id: item.teacher_id, active: item.active }); setAssignmentOpen(true) }
  const openAreaCreate = () => { setEditingArea(null); setAreaDraft({ ...emptyArea, sort_order: areas.length + 1 }); setAreaOpen(true) }
  const openAreaEdit = (area: QualitativeArea) => { setEditingArea(area); setAreaDraft({ name: area.name, short_name: area.short_name ?? '', sort_order: area.sort_order, active: area.active }); setAreaOpen(true) }
  const openBehaviorEdit = (item: BehaviorCatalogItem) => { setEditingBehavior(item); setBehaviorDescription(item.description); setBehaviorActive(item.active); setBehaviorOpen(true) }

  const tabButtons: Array<{ id: Tab; label: string; icon: typeof CalendarRange }> = [
    { id: 'years', label: 'Años y trimestres', icon: CalendarRange },
    { id: 'courses', label: 'Cursos', icon: School },
    { id: 'subjects', label: 'Materias', icon: Layers3 },
    { id: 'assignments', label: 'Asignaciones', icon: UserRoundCheck },
    { id: 'qualitative', label: 'Áreas cualitativas', icon: Sparkles },
  ]

  return (
    <>
      <PageHeader title="Configuración académica" description="Cree y edite el calendario, los cursos, las materias, las asignaciones y los catálogos complementarios." />
      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="tabs">
        {tabButtons.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}><Icon size={17} /> {label}</button>)}
      </div>

      {tab === 'years' && <section className="panel">
        <div className="panel-heading"><div><h2>Años lectivos</h2><p>Al crear un año se generan tres trimestres. Los registros existentes se conservan.</p></div><button className="button button-primary" onClick={openYearCreate}><Plus size={17} /> Nuevo año</button></div>
        <div className="cards-list">
          {years.map((year) => <article className="config-card" key={year.id}>
            <div><h3>{year.name}</h3><p>{year.starts_on} — {year.ends_on}</p><div className="inline-actions"><span className={`badge ${year.active ? 'badge-success' : 'badge-muted'}`}>{year.active ? 'Activo' : 'Histórico'}</span><span className={`badge ${year.closed ? 'badge-muted' : 'badge-primary'}`}>{year.closed ? 'Cerrado' : 'Abierto'}</span><button className="button button-light button-small" onClick={() => openYearEdit(year)}><Pencil size={14} /> Editar</button></div></div>
            <div className="term-list">{terms.filter((term) => term.academic_year_id === year.id).map((term) => <button key={term.id} className={`term-chip ${term.closed ? 'closed' : ''}`} onClick={() => openTermEdit(term)}><Pencil size={13} /> {term.name}: {term.closed ? 'cerrado' : 'abierto'}</button>)}</div>
          </article>)}
        </div>
      </section>}

      {tab === 'courses' && <section className="panel">
        <div className="panel-heading"><div><h2>Cursos y paralelos</h2><p>Los cursos con historial se desactivan; no es necesario eliminarlos.</p></div><button className="button button-primary" onClick={openCourseCreate}><Plus size={17} /> Nuevo curso</button></div>
        <div className="table-wrap"><table><thead><tr><th>Año</th><th>Grado</th><th>Paralelo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{courses.map((course) => <tr key={course.id}><td>{years.find((year) => year.id === course.academic_year_id)?.name}</td><td>{course.grade_level}</td><td>{course.parallel}</td><td><span className={`badge ${course.active ? 'badge-success' : 'badge-muted'}`}>{course.active ? 'Activo' : 'Inactivo'}</span></td><td><button className="button button-light button-small" onClick={() => openCourseEdit(course)}><Pencil size={14} /> Editar</button></td></tr>)}{!courses.length && <tr><td colSpan={5} className="empty-cell">No existen cursos.</td></tr>}</tbody></table></div>
      </section>}

      {tab === 'subjects' && <section className="panel">
        <div className="panel-heading"><div><h2>Materias escolares</h2><p>Edite nombres, abreviaturas y estado sin perder las calificaciones vinculadas.</p></div><button className="button button-primary" onClick={openSubjectCreate}><Plus size={17} /> Nueva materia</button></div>
        <div className="table-wrap"><table><thead><tr><th>Materia</th><th>Abreviatura</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{subjects.map((subject) => <tr key={subject.id}><td><strong>{subject.name}</strong></td><td>{subject.short_name || '—'}</td><td><span className={`badge ${subject.active ? 'badge-success' : 'badge-muted'}`}>{subject.active ? 'Activa' : 'Inactiva'}</span></td><td><button className="button button-light button-small" onClick={() => openSubjectEdit(subject)}><Pencil size={14} /> Editar</button></td></tr>)}{!subjects.length && <tr><td colSpan={4} className="empty-cell">No existen materias.</td></tr>}</tbody></table></div>
      </section>}

      {tab === 'assignments' && <section className="panel">
        <div className="panel-heading"><div><h2>Asignaciones docentes</h2><p>Puede cambiar docente, curso, materia o estado de la asignación.</p></div><button className="button button-primary" onClick={openAssignmentCreate}><Plus size={17} /> Nueva asignación</button></div>
        <div className="table-wrap"><table><thead><tr><th>Año</th><th>Curso</th><th>Materia</th><th>Docente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{assignments.map((item) => <tr key={item.id}><td>{years.find((year) => year.id === item.academic_year_id)?.name}</td><td>{item.course?.grade_level} “{item.course?.parallel}”</td><td>{item.subject?.name}</td><td>{fullName(item.teacher?.first_names, item.teacher?.last_names)}</td><td><span className={`badge ${item.active ? 'badge-success' : 'badge-muted'}`}>{item.active ? 'Activa' : 'Inactiva'}</span></td><td><button className="button button-light button-small" onClick={() => openAssignmentEdit(item)}><Pencil size={14} /> Editar</button></td></tr>)}{!assignments.length && <tr><td colSpan={6} className="empty-cell">No existen asignaciones.</td></tr>}</tbody></table></div>
      </section>}

      {tab === 'qualitative' && <div className="settings-grid">
        <section className="panel"><div className="panel-heading"><div><h2>Áreas cualitativas</h2><p>No afectan el promedio académico y aparecen en las boletas.</p></div><button className="button button-primary" onClick={openAreaCreate}><Plus size={17} /> Nueva área</button></div><div className="table-wrap"><table><thead><tr><th>Área</th><th>Abreviatura</th><th>Orden</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{areas.map((area) => <tr key={area.id}><td>{area.name}</td><td>{area.short_name || '—'}</td><td>{area.sort_order}</td><td><span className={`badge ${area.active ? 'badge-success' : 'badge-muted'}`}>{area.active ? 'Activa' : 'Inactiva'}</span></td><td><button className="button button-light button-small" onClick={() => openAreaEdit(area)}><Pencil size={14} /> Editar</button></td></tr>)}</tbody></table></div></section>
        <section className="panel"><div className="panel-heading"><div><h2>Catálogo de comportamiento</h2><p>La letra se mantiene; la descripción es editable.</p></div></div><div className="table-wrap"><table><thead><tr><th>Letra</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{behaviorCatalog.map((item) => <tr key={item.letter}><td><strong>{item.letter}</strong></td><td>{item.description}</td><td><span className={`badge ${item.active ? 'badge-success' : 'badge-muted'}`}>{item.active ? 'Activo' : 'Inactivo'}</span></td><td><button className="button button-light button-small" onClick={() => openBehaviorEdit(item)}><Pencil size={14} /> Editar</button></td></tr>)}</tbody></table></div></section>
      </div>}

      <Modal open={yearOpen} title={editingYear ? 'Editar año lectivo' : 'Nuevo año lectivo'} onClose={() => setYearOpen(false)}><div className="form-grid"><label className="field full-span"><span>Nombre</span><input value={yearDraft.name} onChange={(event) => setYearDraft({ ...yearDraft, name: event.target.value })} placeholder="2026-2027" /></label><label className="field"><span>Fecha inicial</span><input type="date" value={yearDraft.starts_on} onChange={(event) => setYearDraft({ ...yearDraft, starts_on: event.target.value })} /></label><label className="field"><span>Fecha final</span><input type="date" value={yearDraft.ends_on} onChange={(event) => setYearDraft({ ...yearDraft, ends_on: event.target.value })} /></label><label className="check-field"><input type="checkbox" checked={yearDraft.active} onChange={(event) => setYearDraft({ ...yearDraft, active: event.target.checked })} /><span>Año activo</span></label><label className="check-field"><input type="checkbox" checked={yearDraft.closed} onChange={(event) => setYearDraft({ ...yearDraft, closed: event.target.checked })} /><span>Año cerrado</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setYearOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveYear().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>

      <Modal open={termOpen} title="Editar trimestre" onClose={() => setTermOpen(false)}><div className="form-grid"><label className="field full-span"><span>Nombre</span><input value={termDraft.name} onChange={(event) => setTermDraft({ ...termDraft, name: event.target.value })} /></label><label className="field"><span>Fecha inicial</span><input type="date" value={termDraft.starts_on} onChange={(event) => setTermDraft({ ...termDraft, starts_on: event.target.value })} /></label><label className="field"><span>Fecha final</span><input type="date" value={termDraft.ends_on} onChange={(event) => setTermDraft({ ...termDraft, ends_on: event.target.value })} /></label><label className="check-field full-span"><input type="checkbox" checked={termDraft.closed} onChange={(event) => setTermDraft({ ...termDraft, closed: event.target.checked })} /><span>Trimestre cerrado</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setTermOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveTerm().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>

      <Modal open={courseOpen} title={editingCourse ? 'Editar curso' : 'Nuevo curso'} onClose={() => setCourseOpen(false)}><div className="form-grid"><label className="field full-span"><span>Año lectivo</span><select value={courseDraft.academic_year_id} onChange={(event) => setCourseDraft({ ...courseDraft, academic_year_id: event.target.value })}>{years.map((year) => <option value={year.id} key={year.id}>{year.name}</option>)}</select></label><label className="field"><span>Grado</span><input value={courseDraft.grade_level} onChange={(event) => setCourseDraft({ ...courseDraft, grade_level: event.target.value })} /></label><label className="field"><span>Paralelo</span><input value={courseDraft.parallel} onChange={(event) => setCourseDraft({ ...courseDraft, parallel: event.target.value })} /></label><label className="check-field full-span"><input type="checkbox" checked={courseDraft.active} onChange={(event) => setCourseDraft({ ...courseDraft, active: event.target.checked })} /><span>Curso activo</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setCourseOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveCourse().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>

      <Modal open={subjectOpen} title={editingSubject ? 'Editar materia' : 'Nueva materia'} onClose={() => setSubjectOpen(false)}><div className="form-grid"><label className="field full-span"><span>Nombre</span><input value={subjectDraft.name} onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })} /></label><label className="field full-span"><span>Abreviatura</span><input value={subjectDraft.short_name} onChange={(event) => setSubjectDraft({ ...subjectDraft, short_name: event.target.value })} /></label><label className="check-field full-span"><input type="checkbox" checked={subjectDraft.active} onChange={(event) => setSubjectDraft({ ...subjectDraft, active: event.target.checked })} /><span>Materia activa</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setSubjectOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveSubject().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>

      <Modal open={assignmentOpen} title={editingAssignment ? 'Editar asignación' : 'Nueva asignación'} onClose={() => setAssignmentOpen(false)}><div className="form-grid"><label className="field full-span"><span>Año lectivo</span><select value={assignmentDraft.academic_year_id} disabled={Boolean(editingAssignment)} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, academic_year_id: event.target.value, course_id: '' })}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label className="field full-span"><span>Curso</span><select value={assignmentDraft.course_id} disabled={Boolean(editingAssignment)} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, course_id: event.target.value })}><option value="">Seleccione</option>{selectedYearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level} “{course.parallel}”</option>)}</select></label><label className="field"><span>Materia</span><select value={assignmentDraft.subject_id} disabled={Boolean(editingAssignment)} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, subject_id: event.target.value })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label className="field"><span>Docente</span><select value={assignmentDraft.teacher_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, teacher_id: event.target.value })}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher.first_names, teacher.last_names)}</option>)}</select></label><label className="check-field full-span"><input type="checkbox" checked={assignmentDraft.active} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, active: event.target.checked })} /><span>Asignación activa</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setAssignmentOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveAssignment().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>

      <Modal open={areaOpen} title={editingArea ? 'Editar área cualitativa' : 'Nueva área cualitativa'} onClose={() => setAreaOpen(false)}><div className="form-grid"><label className="field full-span"><span>Nombre</span><input value={areaDraft.name} onChange={(event) => setAreaDraft({ ...areaDraft, name: event.target.value })} /></label><label className="field"><span>Abreviatura</span><input value={areaDraft.short_name} onChange={(event) => setAreaDraft({ ...areaDraft, short_name: event.target.value })} /></label><label className="field"><span>Orden</span><input type="number" min="1" value={areaDraft.sort_order} onChange={(event) => setAreaDraft({ ...areaDraft, sort_order: Number(event.target.value) || 1 })} /></label><label className="check-field full-span"><input type="checkbox" checked={areaDraft.active} onChange={(event) => setAreaDraft({ ...areaDraft, active: event.target.checked })} /><span>Área activa</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setAreaOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveArea().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>

      <Modal open={behaviorOpen} title={`Editar comportamiento ${editingBehavior?.letter || ''}`} onClose={() => setBehaviorOpen(false)}><div className="form-grid"><label className="field full-span"><span>Descripción</span><textarea rows={5} value={behaviorDescription} onChange={(event) => setBehaviorDescription(event.target.value)} /></label><label className="check-field full-span"><input type="checkbox" checked={behaviorActive} onChange={(event) => setBehaviorActive(event.target.checked)} /><span>Opción activa</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setBehaviorOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveBehavior().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>
    </>
  )
}
