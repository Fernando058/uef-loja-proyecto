import { FolderKanban, Plus, RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  Course,
  Enrollment,
  InterdisciplinaryProject,
  ProjectIndicator,
  ProjectIndicatorScore,
  ProjectStatus,
  ProjectStudentComponent,
  ProjectSubject,
  ProjectSubjectScore,
  Subject,
  TeacherAssignment,
  Term,
} from '../types/domain'

interface ProjectDraft {
  name: string
  description: string
  product_description: string
  presentation_description: string
  status: ProjectStatus
}

interface IndicatorDraft {
  project_subject_id: string
  code: string
  description: string
  sort_order: number
}

const emptyProject: ProjectDraft = { name: '', description: '', product_description: '', presentation_description: '', status: 'draft' }
const emptyIndicator: IndicatorDraft = { project_subject_id: '', code: '', description: '', sort_order: 10 }

const parseScore = (value: string) => {
  if (!value.trim()) return null
  const score = Number(value)
  if (!Number.isFinite(score) || score < 1 || score > 10) throw new Error('Las calificaciones deben estar entre 1,00 y 10,00.')
  return score
}

export function ProjectsPage() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const [years, setYears] = useState<AcademicYear[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [projects, setProjects] = useState<InterdisciplinaryProject[]>([])
  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [termId, setTermId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projectSubjects, setProjectSubjects] = useState<ProjectSubject[]>([])
  const [selectedProjectSubjectId, setSelectedProjectSubjectId] = useState('')
  const [indicators, setIndicators] = useState<ProjectIndicator[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [indicatorScores, setIndicatorScores] = useState<ProjectIndicatorScore[]>([])
  const [components, setComponents] = useState<ProjectStudentComponent[]>([])
  const [projectScores, setProjectScores] = useState<ProjectSubjectScore[]>([])
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  const [componentDrafts, setComponentDrafts] = useState<Record<string, { product: string; presentation: string }>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const [projectOpen, setProjectOpen] = useState(false)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProject)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [subjectToAdd, setSubjectToAdd] = useState('')
  const [indicatorOpen, setIndicatorOpen] = useState(false)
  const [indicatorDraft, setIndicatorDraft] = useState<IndicatorDraft>(emptyIndicator)

  const selectedCourse = courses.find((item) => item.id === courseId)
  const selectedProject = projects.find((item) => item.id === projectId)
  const selectedProjectSubject = projectSubjects.find((item) => item.id === selectedProjectSubjectId)
  const canManageSelectedSubject = Boolean(isDirector || (profile && selectedProjectSubject?.teacher_assignment?.teacher?.profile_id === profile.id))
  const selectedSubjectIndicators = indicators.filter((item) => item.project_subject_id === selectedProjectSubjectId && item.active).sort((a, b) => a.sort_order - b.sort_order)

  const loadBase = useCallback(async () => {
    const [yearRes, courseRes, subjectRes, assignmentRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
      supabase.from('courses').select('*,grade_level:grade_levels(*)').eq('active', true),
      supabase.from('subjects').select('*').eq('active', true).order('sort_order'),
      supabase.from('teacher_assignments').select('*,course:courses(*,grade_level:grade_levels(*)),subject:subjects(*),teacher:teachers(*)').eq('active', true),
    ])
    const firstError = [yearRes, courseRes, subjectRes, assignmentRes].find((item) => item.error)?.error
    if (firstError) throw firstError
    const yearRows = (yearRes.data ?? []) as AcademicYear[]
    setYears(yearRows)
    setCourses((courseRes.data ?? []) as Course[])
    setSubjects((subjectRes.data ?? []) as Subject[])
    setAssignments((assignmentRes.data ?? []) as TeacherAssignment[])
    const preferredYear = yearRows.find((item) => item.active)?.id ?? yearRows[0]?.id ?? ''
    if (!yearId) setYearId(preferredYear)
  }, [yearId])

  useEffect(() => { void loadBase().catch((error) => setNotice(errorMessage(error))) }, [loadBase])

  useEffect(() => {
    if (!yearId) return
    const run = async () => {
      const { data, error } = await supabase.from('terms').select('*').eq('academic_year_id', yearId).order('number')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      if (!rows.some((item) => item.id === termId)) setTermId(rows[0]?.id ?? '')
      const yearCourses = courses.filter((item) => item.academic_year_id === yearId)
      if (!yearCourses.some((item) => item.id === courseId)) setCourseId(yearCourses[0]?.id ?? '')
    }
    void run().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, courses, courseId, termId])

  const loadProjects = useCallback(async () => {
    if (!yearId || !courseId || !termId) { setProjects([]); setProjectId(''); return }
    const { data, error } = await supabase.from('interdisciplinary_projects').select('*').eq('academic_year_id', yearId).eq('course_id', courseId).eq('term_id', termId).order('created_at')
    if (error) throw error
    const rows = (data ?? []) as InterdisciplinaryProject[]
    setProjects(rows)
    if (!rows.some((item) => item.id === projectId)) setProjectId(rows[0]?.id ?? '')
  }, [yearId, courseId, termId, projectId])

  useEffect(() => { void loadProjects().catch((error) => setNotice(errorMessage(error))) }, [loadProjects])

  const loadProjectDetail = useCallback(async () => {
    if (!projectId || !selectedProject) {
      setProjectSubjects([]); setIndicators([]); setEnrollments([]); setIndicatorScores([]); setComponents([]); setProjectScores([]); return
    }
    const [subjectRes, indicatorRes, enrollmentRes, componentRes, scoreViewRes] = await Promise.all([
      supabase.from('project_subjects').select('*,subject:subjects(*),teacher_assignment:teacher_assignments(*,teacher:teachers(*))').eq('project_id', projectId).eq('active', true),
      supabase.from('project_indicators').select('*').in('project_subject_id', (await supabase.from('project_subjects').select('id').eq('project_id', projectId)).data?.map((item: { id: string }) => item.id) ?? ['00000000-0000-0000-0000-000000000000']).eq('active', true).order('sort_order'),
      supabase.from('enrollments').select('*,student:students(*)').eq('academic_year_id', selectedProject.academic_year_id).eq('course_id', selectedProject.course_id).in('status', ['active', 'completed']),
      supabase.from('project_student_components').select('*').eq('project_id', projectId),
      supabase.from('v_project_subject_scores').select('*').eq('project_id', projectId),
    ])
    const firstError = [subjectRes, indicatorRes, enrollmentRes, componentRes, scoreViewRes].find((item) => item.error)?.error
    if (firstError) throw firstError
    const subjectRows = (subjectRes.data ?? []) as ProjectSubject[]
    const indicatorRows = (indicatorRes.data ?? []) as ProjectIndicator[]
    const enrollmentRows = ((enrollmentRes.data ?? []) as Enrollment[]).sort((a, b) => fullName(a.student?.first_names, a.student?.last_names).localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'))
    setProjectSubjects(subjectRows)
    setIndicators(indicatorRows)
    setEnrollments(enrollmentRows)
    setComponents((componentRes.data ?? []) as ProjectStudentComponent[])
    setProjectScores((scoreViewRes.data ?? []) as ProjectSubjectScore[])
    if (!subjectRows.some((item) => item.id === selectedProjectSubjectId)) setSelectedProjectSubjectId(subjectRows[0]?.id ?? '')

    const indicatorIds = indicatorRows.map((item) => item.id)
    let indicatorScoreRows: ProjectIndicatorScore[] = []
    if (indicatorIds.length) {
      const { data, error } = await supabase.from('project_indicator_scores').select('*').in('indicator_id', indicatorIds)
      if (error) throw error
      indicatorScoreRows = (data ?? []) as ProjectIndicatorScore[]
    }
    setIndicatorScores(indicatorScoreRows)

    const scoreMap: Record<string, string> = {}
    for (const enrollment of enrollmentRows) {
      for (const indicator of indicatorRows) {
        const current = indicatorScoreRows.find((item) => item.enrollment_id === enrollment.id && item.indicator_id === indicator.id)
        scoreMap[`${enrollment.id}:${indicator.id}`] = current?.score == null ? '' : String(current.score)
      }
    }
    setScoreDrafts(scoreMap)
    const compMap: Record<string, { product: string; presentation: string }> = {}
    for (const enrollment of enrollmentRows) {
      const current = ((componentRes.data ?? []) as ProjectStudentComponent[]).find((item) => item.enrollment_id === enrollment.id)
      compMap[enrollment.id] = { product: current?.product_score == null ? '' : String(current.product_score), presentation: current?.presentation_score == null ? '' : String(current.presentation_score) }
    }
    setComponentDrafts(compMap)
  }, [projectId, selectedProject, selectedProjectSubjectId])

  useEffect(() => { void loadProjectDetail().catch((error) => setNotice(errorMessage(error))) }, [loadProjectDetail])

  const createProject = async () => {
    if (!profile || !yearId || !courseId || !termId || !projectDraft.name.trim()) return
    const { error } = await supabase.from('interdisciplinary_projects').insert({ academic_year_id: yearId, term_id: termId, course_id: courseId, name: projectDraft.name.trim(), description: projectDraft.description.trim() || null, product_description: projectDraft.product_description.trim() || null, presentation_description: projectDraft.presentation_description.trim() || null, status: projectDraft.status, created_by: profile.id })
    if (error) throw error
    setProjectOpen(false); setProjectDraft(emptyProject); setNotice('Proyecto interdisciplinar creado.'); await loadProjects()
  }

  const updateProjectStatus = async (status: ProjectStatus) => {
    if (!selectedProject) return
    const { error } = await supabase.from('interdisciplinary_projects').update({ status }).eq('id', selectedProject.id)
    if (error) throw error
    setNotice(`Proyecto actualizado a estado ${status}.`); await loadProjects()
  }

  const addSubject = async () => {
    if (!selectedProject || !subjectToAdd) return
    const assignment = assignments.find((item) => item.course_id === selectedProject.course_id && item.subject_id === subjectToAdd && item.active)
    const { error } = await supabase.from('project_subjects').insert({ project_id: selectedProject.id, subject_id: subjectToAdd, teacher_assignment_id: assignment?.id ?? null, active: true })
    if (error) throw error
    setSubjectOpen(false); setSubjectToAdd(''); setNotice('Asignatura incorporada al proyecto.'); await loadProjectDetail()
  }

  const addIndicator = async () => {
    if (!indicatorDraft.project_subject_id || !indicatorDraft.description.trim()) return
    const { error } = await supabase.from('project_indicators').insert({ project_subject_id: indicatorDraft.project_subject_id, code: indicatorDraft.code.trim() || null, description: indicatorDraft.description.trim(), sort_order: indicatorDraft.sort_order, active: true })
    if (error) throw error
    setIndicatorOpen(false); setIndicatorDraft(emptyIndicator); setNotice('Indicador agregado.'); await loadProjectDetail()
  }

  const saveScores = async () => {
    if (!selectedProject || !selectedProjectSubject || !profile || !canManageSelectedSubject) return
    setSaving(true)
    try {
      for (const enrollment of enrollments) {
        const component = componentDrafts[enrollment.id] ?? { product: '', presentation: '' }
        const product = parseScore(component.product)
        const presentation = parseScore(component.presentation)
        if (product !== null || presentation !== null) {
          const { error } = await supabase.from('project_student_components').upsert({ project_id: selectedProject.id, enrollment_id: enrollment.id, product_score: product, presentation_score: presentation, updated_by: profile.id }, { onConflict: 'project_id,enrollment_id' })
          if (error) throw error
        }
        for (const indicator of selectedSubjectIndicators) {
          const value = scoreDrafts[`${enrollment.id}:${indicator.id}`] ?? ''
          if (value.trim()) {
            const { error } = await supabase.from('project_indicator_scores').upsert({ indicator_id: indicator.id, enrollment_id: enrollment.id, score: parseScore(value), updated_by: profile.id }, { onConflict: 'indicator_id,enrollment_id' })
            if (error) throw error
          }
        }
      }
      setNotice('Rúbrica y componentes del proyecto guardados.'); await loadProjectDetail()
    } finally { setSaving(false) }
  }

  const yearCourses = courses.filter((item) => item.academic_year_id === yearId)
  const quantitativeSubjects = subjects.filter((item) => item.kind === 'quantitative')
  const availableSubjects = quantitativeSubjects.filter((subject) => !projectSubjects.some((item) => item.subject_id === subject.id))
  const selectedProjectSubjectScore = (enrollmentId: string) => projectScores.find((item) => item.project_subject_id === selectedProjectSubjectId && item.enrollment_id === enrollmentId)

  return <>
    <PageHeader title="Proyecto interdisciplinar" description="Administre el proyecto común, sus materias participantes, indicadores curriculares, producto final y exposición." actions={<button className="button button-light" onClick={() => void loadProjectDetail().catch((error) => setNotice(errorMessage(error)))}><RefreshCw size={17} /> Actualizar</button>} />
    {notice && <div className="alert alert-info">{notice}</div>}

    <section className="panel filters-panel"><div className="filter-grid filter-grid-4"><label className="field"><span>Año lectivo</span><select value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label className="field"><span>Curso</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Seleccione</option>{yearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level?.name} “{course.parallel}”</option>)}</select></label><label className="field"><span>Trimestre</span><select value={termId} onChange={(event) => setTermId(event.target.value)}>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label className="field"><span>Proyecto</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Seleccione</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.status}</option>)}</select></label></div></section>

    {isDirector && <div className="button-row project-admin-actions"><button className="button button-primary" disabled={!courseId || !termId} onClick={() => { setProjectDraft(emptyProject); setProjectOpen(true) }}><Plus size={17} /> Nuevo proyecto</button>{selectedProject && <><button className="button button-secondary" onClick={() => { setSubjectToAdd(availableSubjects[0]?.id ?? ''); setSubjectOpen(true) }}><Plus size={17} /> Agregar materia</button><button className="button button-light" onClick={() => void updateProjectStatus('active').catch((error) => setNotice(errorMessage(error)))}>Activar</button><button className="button button-light" onClick={() => void updateProjectStatus('closed').catch((error) => setNotice(errorMessage(error)))}>Cerrar</button></>}</div>}

    {selectedProject ? <>
      <section className="panel"><div className="panel-heading"><div><h2><FolderKanban size={20} /> {selectedProject.name}</h2><p>{selectedProject.description || 'Sin descripción'} · Estado: <strong>{selectedProject.status}</strong></p></div></div><div className="project-subject-chips">{projectSubjects.map((item) => <button key={item.id} className={selectedProjectSubjectId === item.id ? 'subject-chip active' : 'subject-chip'} onClick={() => setSelectedProjectSubjectId(item.id)}>{item.subject?.abbreviation ?? item.subject?.name}</button>)}{!projectSubjects.length && <span className="empty-inline">Agregue al menos una asignatura participante.</span>}</div></section>

      {selectedProjectSubject && <section className="panel gradebook-panel"><div className="panel-heading"><div><h2>Rúbrica · {selectedProjectSubject.subject?.name}</h2><p>{selectedSubjectIndicators.length} indicador(es). Producto y exposición son componentes comunes del proyecto.</p></div>{canManageSelectedSubject && <div className="button-row"><button className="button button-light" onClick={() => { setIndicatorDraft({ ...emptyIndicator, project_subject_id: selectedProjectSubject.id, sort_order: selectedSubjectIndicators.length * 10 + 10 }); setIndicatorOpen(true) }}><Plus size={16} /> Indicador</button><button className="button button-primary" disabled={saving || !selectedSubjectIndicators.length} onClick={() => void saveScores().catch((error) => setNotice(errorMessage(error)))}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar rúbrica'}</button></div>}</div>
        <div className="table-wrap gradebook-scroll"><table className="gradebook-table project-grade-table"><thead><tr><th className="sticky-col student-col">Estudiante</th>{selectedSubjectIndicators.map((indicator) => <th key={indicator.id}><span className="grade-code">{indicator.code || 'IND'}</span><small>{indicator.description}</small></th>)}<th className="result-head">Producto</th><th className="result-head">Exposición</th><th className="result-head">Nota proyecto</th></tr></thead><tbody>
          {enrollments.map((enrollment) => { const component = componentDrafts[enrollment.id] ?? { product: '', presentation: '' }; const score = selectedProjectSubjectScore(enrollment.id); return <tr key={enrollment.id}><td className="sticky-col student-col"><strong>{fullName(enrollment.student?.first_names, enrollment.student?.last_names)}</strong></td>{selectedSubjectIndicators.map((indicator) => <td key={indicator.id}><input className="score-input" type="number" min="1" max="10" step="0.01" disabled={!canManageSelectedSubject || selectedProject.status === 'closed'} value={scoreDrafts[`${enrollment.id}:${indicator.id}`] ?? ''} onChange={(event) => setScoreDrafts({ ...scoreDrafts, [`${enrollment.id}:${indicator.id}`]: event.target.value })} /></td>)}<td><input className="score-input" type="number" min="1" max="10" step="0.01" disabled={!canManageSelectedSubject || selectedProject.status === 'closed'} value={component.product} onChange={(event) => setComponentDrafts({ ...componentDrafts, [enrollment.id]: { ...component, product: event.target.value } })} /></td><td><input className="score-input" type="number" min="1" max="10" step="0.01" disabled={!canManageSelectedSubject || selectedProject.status === 'closed'} value={component.presentation} onChange={(event) => setComponentDrafts({ ...componentDrafts, [enrollment.id]: { ...component, presentation: event.target.value } })} /></td><td className="calculated-cell final-score">{formatScore(score?.project_score)}</td></tr> })}
          {!enrollments.length && <tr><td colSpan={selectedSubjectIndicators.length + 4} className="empty-cell">No existen estudiantes matriculados.</td></tr>}
        </tbody></table></div>
      </section>}
    </> : <section className="panel"><div className="empty-cell">Seleccione o cree un proyecto interdisciplinar.</div></section>}

    <Modal open={projectOpen} title="Nuevo proyecto interdisciplinar" onClose={() => setProjectOpen(false)}><div className="form-grid"><label className="field full-span"><span>Nombre *</span><input value={projectDraft.name} onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })} /></label><label className="field full-span"><span>Descripción</span><textarea rows={3} value={projectDraft.description} onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })} /></label><label className="field full-span"><span>Producto final esperado</span><textarea rows={2} value={projectDraft.product_description} onChange={(event) => setProjectDraft({ ...projectDraft, product_description: event.target.value })} /></label><label className="field full-span"><span>Exposición final</span><textarea rows={2} value={projectDraft.presentation_description} onChange={(event) => setProjectDraft({ ...projectDraft, presentation_description: event.target.value })} /></label><label className="field full-span"><span>Estado inicial</span><select value={projectDraft.status} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value as ProjectStatus })}><option value="draft">Borrador</option><option value="active">Activo</option></select></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setProjectOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createProject().catch((error) => setNotice(errorMessage(error)))}>Crear</button></div></div></Modal>

    <Modal open={subjectOpen} title="Agregar asignatura al proyecto" onClose={() => setSubjectOpen(false)}><div className="form-grid"><label className="field full-span"><span>Asignatura</span><select value={subjectToAdd} onChange={(event) => setSubjectToAdd(event.target.value)}><option value="">Seleccione</option>{availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setSubjectOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void addSubject().catch((error) => setNotice(errorMessage(error)))}>Agregar</button></div></div></Modal>

    <Modal open={indicatorOpen} title="Nuevo indicador de rúbrica" onClose={() => setIndicatorOpen(false)}><div className="form-grid"><label className="field"><span>Código / referencia</span><input value={indicatorDraft.code} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, code: event.target.value })} /></label><label className="field"><span>Orden</span><input type="number" value={indicatorDraft.sort_order} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, sort_order: Number(event.target.value) })} /></label><label className="field full-span"><span>Indicador *</span><textarea rows={4} value={indicatorDraft.description} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, description: event.target.value })} /></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setIndicatorOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void addIndicator().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div></Modal>
  </>
}
