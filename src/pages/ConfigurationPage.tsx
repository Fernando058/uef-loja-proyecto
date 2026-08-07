import { CalendarRange, Layers3, Plus, School, UserRoundCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  Course,
  Subject,
  Teacher,
  TeacherAssignment,
  Term,
} from '../types/domain'

type Tab = 'years' | 'courses' | 'subjects' | 'assignments'

interface YearDraft {
  name: string
  starts_on: string
  ends_on: string
  active: boolean
}

interface CourseDraft {
  academic_year_id: string
  grade_level: string
  parallel: string
}

interface SubjectDraft {
  name: string
  short_name: string
}

interface AssignmentDraft {
  academic_year_id: string
  course_id: string
  subject_id: string
  teacher_id: string
}

export function ConfigurationPage() {
  const [tab, setTab] = useState<Tab>('years')
  const [years, setYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [notice, setNotice] = useState('')
  const [yearOpen, setYearOpen] = useState(false)
  const [courseOpen, setCourseOpen] = useState(false)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [yearDraft, setYearDraft] = useState<YearDraft>({ name: '', starts_on: '', ends_on: '', active: true })
  const [courseDraft, setCourseDraft] = useState<CourseDraft>({ academic_year_id: '', grade_level: '', parallel: 'A' })
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft>({ name: '', short_name: '' })
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentDraft>({ academic_year_id: '', course_id: '', subject_id: '', teacher_id: '' })

  const load = useCallback(async () => {
    const [yearRes, termRes, courseRes, subjectRes, teacherRes, assignmentRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('starts_on', { ascending: false }),
      supabase.from('terms').select('*').order('order_no'),
      supabase.from('courses').select('*').order('grade_level').order('parallel'),
      supabase.from('subjects').select('*').order('name'),
      supabase.from('teachers').select('*').eq('active', true).order('last_names'),
      supabase
        .from('teacher_assignments')
        .select('*,course:courses(*),subject:subjects(*),teacher:teachers(*)')
        .order('created_at', { ascending: false }),
    ])

    const firstError = [yearRes, termRes, courseRes, subjectRes, teacherRes, assignmentRes].find((item) => item.error)?.error
    if (firstError) throw firstError
    setYears((yearRes.data ?? []) as AcademicYear[])
    setTerms((termRes.data ?? []) as Term[])
    setCourses((courseRes.data ?? []) as Course[])
    setSubjects((subjectRes.data ?? []) as Subject[])
    setTeachers((teacherRes.data ?? []) as Teacher[])
    setAssignments((assignmentRes.data ?? []) as TeacherAssignment[])
  }, [])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const activeYear = years.find((year) => year.active) ?? years[0]
  const selectedYearCourses = useMemo(
    () => courses.filter((course) => course.academic_year_id === assignmentDraft.academic_year_id),
    [courses, assignmentDraft.academic_year_id],
  )

  const createYear = async () => {
    if (!yearDraft.name || !yearDraft.starts_on || !yearDraft.ends_on) {
      setNotice('Complete el nombre y las fechas del año lectivo.')
      return
    }
    if (yearDraft.active) {
      await supabase.from('academic_years').update({ active: false }).eq('active', true)
    }
    const { data, error } = await supabase
      .from('academic_years')
      .insert(yearDraft)
      .select('id')
      .single()
    if (error) throw error

    const { error: termError } = await supabase.from('terms').insert([
      { academic_year_id: data.id, name: 'Trimestre 1', order_no: 1 },
      { academic_year_id: data.id, name: 'Trimestre 2', order_no: 2 },
      { academic_year_id: data.id, name: 'Trimestre 3', order_no: 3 },
    ])
    if (termError) throw termError
    setYearOpen(false)
    setNotice('Año lectivo y sus tres trimestres creados.')
    await load()
  }

  const toggleTerm = async (term: Term) => {
    const { error } = await supabase.from('terms').update({ closed: !term.closed }).eq('id', term.id)
    if (error) throw error
    await load()
  }

  const createCourse = async () => {
    const { error } = await supabase.from('courses').insert({
      ...courseDraft,
      grade_level: courseDraft.grade_level.trim(),
      parallel: courseDraft.parallel.trim().toUpperCase(),
      active: true,
    })
    if (error) throw error
    setCourseOpen(false)
    setNotice('Curso creado.')
    await load()
  }

  const createSubject = async () => {
    const { error } = await supabase.from('subjects').insert({
      name: subjectDraft.name.trim(),
      short_name: subjectDraft.short_name.trim() || null,
      active: true,
    })
    if (error) throw error
    setSubjectOpen(false)
    setNotice('Materia creada.')
    await load()
  }

  const createAssignment = async () => {
    const { error } = await supabase.from('teacher_assignments').insert({ ...assignmentDraft, active: true })
    if (error) throw error
    setAssignmentOpen(false)
    setNotice('Asignación docente creada.')
    await load()
  }

  const tabButtons: Array<{ id: Tab; label: string; icon: typeof CalendarRange }> = [
    { id: 'years', label: 'Años y trimestres', icon: CalendarRange },
    { id: 'courses', label: 'Cursos', icon: School },
    { id: 'subjects', label: 'Materias', icon: Layers3 },
    { id: 'assignments', label: 'Asignaciones', icon: UserRoundCheck },
  ]

  return (
    <>
      <PageHeader
        title="Configuración académica"
        description="Organice el calendario, los cursos, las materias y las responsabilidades docentes."
      />
      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="tabs">
        {tabButtons.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      {tab === 'years' && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Años lectivos</h2><p>Al crear un año se generan automáticamente tres trimestres.</p></div>
            <button className="button button-primary" onClick={() => {
              setYearDraft({ name: '', starts_on: '', ends_on: '', active: true })
              setYearOpen(true)
            }}><Plus size={17} /> Nuevo año</button>
          </div>
          <div className="cards-list">
            {years.map((year) => (
              <article className="config-card" key={year.id}>
                <div>
                  <h3>{year.name}</h3>
                  <p>{year.starts_on} — {year.ends_on}</p>
                  <span className={`badge ${year.active ? 'badge-success' : 'badge-muted'}`}>{year.active ? 'Activo' : 'Histórico'}</span>
                </div>
                <div className="term-list">
                  {terms.filter((term) => term.academic_year_id === year.id).map((term) => (
                    <button
                      key={term.id}
                      className={`term-chip ${term.closed ? 'closed' : ''}`}
                      onClick={() => void toggleTerm(term).catch((error) => setNotice(errorMessage(error)))}
                    >
                      {term.name}: {term.closed ? 'cerrado' : 'abierto'}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'courses' && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Cursos y paralelos</h2><p>Cada curso pertenece a un año lectivo.</p></div>
            <button className="button button-primary" onClick={() => {
              setCourseDraft({ academic_year_id: activeYear?.id ?? '', grade_level: '', parallel: 'A' })
              setCourseOpen(true)
            }}><Plus size={17} /> Nuevo curso</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Año lectivo</th><th>Grado</th><th>Paralelo</th><th>Estado</th></tr></thead><tbody>
            {courses.map((course) => <tr key={course.id}><td>{years.find((year) => year.id === course.academic_year_id)?.name}</td><td>{course.grade_level}</td><td>{course.parallel}</td><td><span className="badge badge-success">Activo</span></td></tr>)}
            {!courses.length && <tr><td colSpan={4} className="empty-cell">No existen cursos.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {tab === 'subjects' && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Materias escolares</h2><p>Las materias se reutilizan en los distintos años y cursos.</p></div>
            <button className="button button-primary" onClick={() => { setSubjectDraft({ name: '', short_name: '' }); setSubjectOpen(true) }}><Plus size={17} /> Nueva materia</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Materia</th><th>Abreviatura</th><th>Estado</th></tr></thead><tbody>
            {subjects.map((subject) => <tr key={subject.id}><td><strong>{subject.name}</strong></td><td>{subject.short_name || '—'}</td><td><span className="badge badge-success">Activa</span></td></tr>)}
            {!subjects.length && <tr><td colSpan={3} className="empty-cell">No existen materias.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {tab === 'assignments' && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Asignaciones docentes</h2><p>Relacionan docente, curso, materia y año lectivo.</p></div>
            <button className="button button-primary" onClick={() => {
              setAssignmentDraft({ academic_year_id: activeYear?.id ?? '', course_id: '', subject_id: '', teacher_id: '' })
              setAssignmentOpen(true)
            }}><Plus size={17} /> Nueva asignación</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Año</th><th>Curso</th><th>Materia</th><th>Docente</th></tr></thead><tbody>
            {assignments.map((item) => <tr key={item.id}><td>{years.find((year) => year.id === item.academic_year_id)?.name}</td><td>{item.course?.grade_level} “{item.course?.parallel}”</td><td>{item.subject?.name}</td><td>{fullName(item.teacher?.first_names, item.teacher?.last_names)}</td></tr>)}
            {!assignments.length && <tr><td colSpan={4} className="empty-cell">No existen asignaciones.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      <Modal open={yearOpen} title="Nuevo año lectivo" onClose={() => setYearOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Nombre</span><input value={yearDraft.name} onChange={(event) => setYearDraft({ ...yearDraft, name: event.target.value })} placeholder="2026-2027" /></label>
          <label className="field"><span>Fecha inicial</span><input type="date" value={yearDraft.starts_on} onChange={(event) => setYearDraft({ ...yearDraft, starts_on: event.target.value })} /></label>
          <label className="field"><span>Fecha final</span><input type="date" value={yearDraft.ends_on} onChange={(event) => setYearDraft({ ...yearDraft, ends_on: event.target.value })} /></label>
          <label className="check-field full-span"><input type="checkbox" checked={yearDraft.active} onChange={(event) => setYearDraft({ ...yearDraft, active: event.target.checked })} /><span>Establecer como año lectivo activo</span></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setYearOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createYear().catch((error) => setNotice(errorMessage(error)))}>Crear año</button></div>
        </div>
      </Modal>

      <Modal open={courseOpen} title="Nuevo curso" onClose={() => setCourseOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Año lectivo</span><select value={courseDraft.academic_year_id} onChange={(event) => setCourseDraft({ ...courseDraft, academic_year_id: event.target.value })}><option value="">Seleccione</option>{years.map((year) => <option value={year.id} key={year.id}>{year.name}</option>)}</select></label>
          <label className="field"><span>Grado</span><input value={courseDraft.grade_level} onChange={(event) => setCourseDraft({ ...courseDraft, grade_level: event.target.value })} placeholder="Sexto EGB" /></label>
          <label className="field"><span>Paralelo</span><input value={courseDraft.parallel} onChange={(event) => setCourseDraft({ ...courseDraft, parallel: event.target.value })} /></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setCourseOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createCourse().catch((error) => setNotice(errorMessage(error)))}>Crear curso</button></div>
        </div>
      </Modal>

      <Modal open={subjectOpen} title="Nueva materia" onClose={() => setSubjectOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Nombre de la materia</span><input value={subjectDraft.name} onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })} /></label>
          <label className="field full-span"><span>Abreviatura</span><input value={subjectDraft.short_name} onChange={(event) => setSubjectDraft({ ...subjectDraft, short_name: event.target.value })} placeholder="MAT" /></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setSubjectOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createSubject().catch((error) => setNotice(errorMessage(error)))}>Crear materia</button></div>
        </div>
      </Modal>

      <Modal open={assignmentOpen} title="Nueva asignación docente" onClose={() => setAssignmentOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Año lectivo</span><select value={assignmentDraft.academic_year_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, academic_year_id: event.target.value, course_id: '' })}><option value="">Seleccione</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label className="field full-span"><span>Curso</span><select value={assignmentDraft.course_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, course_id: event.target.value })}><option value="">Seleccione</option>{selectedYearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level} “{course.parallel}”</option>)}</select></label>
          <label className="field"><span>Materia</span><select value={assignmentDraft.subject_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, subject_id: event.target.value })}><option value="">Seleccione</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="field"><span>Docente</span><select value={assignmentDraft.teacher_id} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, teacher_id: event.target.value })}><option value="">Seleccione</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher.first_names, teacher.last_names)}</option>)}</select></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setAssignmentOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createAssignment().catch((error) => setNotice(errorMessage(error)))}>Guardar asignación</button></div>
        </div>
      </Modal>
    </>
  )
}
