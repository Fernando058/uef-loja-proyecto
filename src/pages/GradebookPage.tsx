import { Plus, RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  Assessment,
  AssessmentType,
  Enrollment,
  Grade,
  SummativeRecord,
  TeacherAssignment,
  Term,
  TermSubjectResult,
} from '../types/domain'

interface GradeDraft {
  score: string
  status: Grade['status']
}

interface SummativeDraft {
  project_score: string
  initial_score: string
  improvement_score: string
  reinforcement_score: string
}

const toNullableScore = (value: string) => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(10, Math.max(0, parsed)) : null
}

export function GradebookPage() {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([])
  const [assignmentId, setAssignmentId] = useState('')
  const [termId, setTermId] = useState('')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [grades, setGrades] = useState<Record<string, GradeDraft>>({})
  const [summative, setSummative] = useState<Record<string, SummativeDraft>>({})
  const [behavior, setBehavior] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, TermSubjectResult>>({})
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [assessmentDraft, setAssessmentDraft] = useState({ assessment_type_id: '', title: '', assessment_date: '' })

  const selectedAssignment = assignments.find((item) => item.id === assignmentId)

  const loadSelectors = useCallback(async () => {
    const [assignmentRes, typeRes] = await Promise.all([
      supabase.from('teacher_assignments').select('*,course:courses(*),subject:subjects(*),teacher:teachers(*)').eq('active', true),
      supabase.from('assessment_types').select('*').eq('active', true).order('code'),
    ])
    if (assignmentRes.error) throw assignmentRes.error
    if (typeRes.error) throw typeRes.error
    const items = (assignmentRes.data ?? []) as TeacherAssignment[]
    setAssignments(items)
    setAssessmentTypes((typeRes.data ?? []) as AssessmentType[])
    if (!assignmentId && items[0]) setAssignmentId(items[0].id)
  }, [assignmentId])

  useEffect(() => {
    void loadSelectors().catch((error) => setNotice(errorMessage(error)))
  }, [loadSelectors])

  useEffect(() => {
    if (!selectedAssignment) {
      setTerms([])
      return
    }
    const loadTerms = async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('academic_year_id', selectedAssignment.academic_year_id)
        .order('order_no')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      if (!rows.some((item) => item.id === termId)) setTermId(rows[0]?.id ?? '')
    }
    void loadTerms().catch((error) => setNotice(errorMessage(error)))
  }, [selectedAssignment, termId])

  const loadGradebook = useCallback(async () => {
    if (!selectedAssignment || !termId) return
    setLoading(true)
    setNotice('')
    try {
      const [enrollmentRes, assessmentRes, summativeRes, behaviorRes, resultRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('*,student:students(*)')
          .eq('academic_year_id', selectedAssignment.academic_year_id)
          .eq('course_id', selectedAssignment.course_id)
          .eq('status', 'active'),
        supabase
          .from('assessments')
          .select('*')
          .eq('teacher_assignment_id', selectedAssignment.id)
          .eq('term_id', termId)
          .eq('active', true)
          .order('assessment_date')
          .order('created_at'),
        supabase
          .from('summative_records')
          .select('*')
          .eq('teacher_assignment_id', selectedAssignment.id)
          .eq('term_id', termId),
        supabase
          .from('behavior_records')
          .select('enrollment_id,letter')
          .eq('course_id', selectedAssignment.course_id)
          .eq('term_id', termId),
        supabase
          .from('v_term_subject_results')
          .select('*')
          .eq('teacher_assignment_id', selectedAssignment.id)
          .eq('term_id', termId),
      ])

      const firstError = [enrollmentRes, assessmentRes, summativeRes, behaviorRes, resultRes].find((item) => item.error)?.error
      if (firstError) throw firstError

      const enrollmentRows = (enrollmentRes.data ?? []) as Enrollment[]
      const assessmentRows = (assessmentRes.data ?? []) as Assessment[]
      setEnrollments(enrollmentRows.sort((a, b) => fullName(a.student?.first_names, a.student?.last_names).localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es')))
      setAssessments(assessmentRows)

      const assessmentIds = assessmentRows.map((item) => item.id)
      let gradeRows: Grade[] = []
      if (assessmentIds.length) {
        const { data, error } = await supabase.from('grades').select('*').in('assessment_id', assessmentIds)
        if (error) throw error
        gradeRows = (data ?? []) as Grade[]
      }

      const gradeMap: Record<string, GradeDraft> = {}
      for (const enrollment of enrollmentRows) {
        for (const assessment of assessmentRows) {
          const current = gradeRows.find((item) => item.enrollment_id === enrollment.id && item.assessment_id === assessment.id)
          gradeMap[`${enrollment.id}:${assessment.id}`] = {
            score: current?.score === null || current?.score === undefined ? '' : String(current.score),
            status: current?.status ?? 'pending',
          }
        }
      }
      setGrades(gradeMap)

      const summativeRows = (summativeRes.data ?? []) as SummativeRecord[]
      const sumMap: Record<string, SummativeDraft> = {}
      for (const enrollment of enrollmentRows) {
        const current = summativeRows.find((item) => item.enrollment_id === enrollment.id)
        sumMap[enrollment.id] = {
          project_score: current?.project_score == null ? '' : String(current.project_score),
          initial_score: current?.initial_score == null ? '' : String(current.initial_score),
          improvement_score: current?.improvement_score == null ? '' : String(current.improvement_score),
          reinforcement_score: current?.reinforcement_score == null ? '' : String(current.reinforcement_score),
        }
      }
      setSummative(sumMap)
      setBehavior(Object.fromEntries((behaviorRes.data ?? []).map((item: any) => [item.enrollment_id, item.letter])))
      setResults(Object.fromEntries(((resultRes.data ?? []) as TermSubjectResult[]).map((item) => [item.enrollment_id, item])))
    } finally {
      setLoading(false)
    }
  }, [selectedAssignment, termId])

  useEffect(() => {
    void loadGradebook().catch((error) => setNotice(errorMessage(error)))
  }, [loadGradebook])

  const createAssessment = async () => {
    if (!selectedAssignment || !termId || !assessmentDraft.title.trim()) {
      setNotice('Escriba el título de la evaluación.')
      return
    }
    const selectedType = assessmentTypes.find((item) => item.id === assessmentDraft.assessment_type_id)
    const { error } = await supabase.from('assessments').insert({
      teacher_assignment_id: selectedAssignment.id,
      term_id: termId,
      assessment_type_id: assessmentDraft.assessment_type_id || null,
      code: selectedType?.code ?? null,
      title: assessmentDraft.title.trim(),
      assessment_date: assessmentDraft.assessment_date || null,
      max_score: 10,
      active: true,
    })
    if (error) throw error
    setAssessmentOpen(false)
    setAssessmentDraft({ assessment_type_id: '', title: '', assessment_date: '' })
    setNotice('Evaluación formativa creada.')
    await loadGradebook()
  }

  const saveAll = async () => {
    if (!selectedAssignment || !termId) return
    setSaving(true)
    setNotice('')
    try {
      const gradePayload = Object.entries(grades).map(([key, draft]) => {
        const [enrollment_id, assessment_id] = key.split(':')
        const score = toNullableScore(draft.score)
        return {
          enrollment_id,
          assessment_id,
          score,
          status: score === null ? draft.status : 'graded',
        }
      })

      if (gradePayload.length) {
        const { error } = await supabase.from('grades').upsert(gradePayload, { onConflict: 'assessment_id,enrollment_id' })
        if (error) throw error
      }

      const sumPayload = Object.entries(summative).map(([enrollment_id, draft]) => ({
        enrollment_id,
        teacher_assignment_id: selectedAssignment.id,
        term_id: termId,
        project_score: toNullableScore(draft.project_score),
        initial_score: toNullableScore(draft.initial_score),
        improvement_score: toNullableScore(draft.improvement_score),
        reinforcement_score: toNullableScore(draft.reinforcement_score),
      }))
      if (sumPayload.length) {
        const { error } = await supabase.from('summative_records').upsert(sumPayload, { onConflict: 'teacher_assignment_id,term_id,enrollment_id' })
        if (error) throw error
      }

      const behaviorPayload = Object.entries(behavior)
        .filter(([, letter]) => letter)
        .map(([enrollment_id, letter]) => ({ enrollment_id, course_id: selectedAssignment.course_id, term_id: termId, letter }))
      if (behaviorPayload.length) {
        const { error } = await supabase.from('behavior_records').upsert(behaviorPayload, { onConflict: 'enrollment_id,term_id' })
        if (error) throw error
      }

      setNotice('Calificaciones guardadas correctamente.')
      await loadGradebook()
    } finally {
      setSaving(false)
    }
  }

  const termClosed = terms.find((term) => term.id === termId)?.closed ?? false
  const canEdit = !termClosed

  const resultRows = useMemo(() => enrollments.map((enrollment) => ({ enrollment, result: results[enrollment.id] })), [enrollments, results])

  return (
    <>
      <PageHeader
        title="Libro de calificaciones"
        description="Ingrese las evaluaciones formativas, el proceso sumativo y el comportamiento trimestral. Las celdas vacías no se consideran cero."
        actions={
          <div className="button-row">
            <button className="button button-light" onClick={() => void loadGradebook().catch((error) => setNotice(errorMessage(error)))}><RefreshCw size={17} /> Actualizar</button>
            <button className="button button-primary" onClick={() => void saveAll().catch((error) => setNotice(errorMessage(error)))} disabled={!canEdit || saving}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar todo'}</button>
          </div>
        }
      />

      {notice && <div className="alert alert-info">{notice}</div>}
      {termClosed && <div className="alert alert-warning">Este trimestre está cerrado. La información se muestra en modo de consulta.</div>}

      <section className="panel filters-panel">
        <div className="filter-grid">
          <label className="field">
            <span>Curso y materia</span>
            <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
              <option value="">Seleccione</option>
              {assignments.map((item) => (
                <option key={item.id} value={item.id}>{item.course?.grade_level} “{item.course?.parallel}” · {item.subject?.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Trimestre</span>
            <select value={termId} onChange={(event) => setTermId(event.target.value)}>
              <option value="">Seleccione</option>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.name}{term.closed ? ' (cerrado)' : ''}</option>)}
            </select>
          </label>
          <div className="filter-action">
            <button className="button button-secondary" disabled={!canEdit || !assignmentId || !termId} onClick={() => setAssessmentOpen(true)}><Plus size={17} /> Nueva evaluación formativa</button>
          </div>
        </div>
      </section>

      <section className="panel gradebook-panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedAssignment ? `${selectedAssignment.course?.grade_level} “${selectedAssignment.course?.parallel}” · ${selectedAssignment.subject?.name}` : 'Seleccione una asignación'}</h2>
            <p>{assessments.length} evaluación(es) formativa(s) · {enrollments.length} estudiante(s)</p>
          </div>
        </div>

        {loading ? <div className="empty-cell">Cargando libro de calificaciones…</div> : (
          <div className="table-wrap gradebook-scroll">
            <table className="gradebook-table">
              <thead>
                <tr>
                  <th className="sticky-col student-col">Estudiante</th>
                  {assessments.map((assessment) => (
                    <th key={assessment.id} title={assessment.title}>
                      <span className="grade-code">{assessment.code || 'FORM'}</span>
                      <small>{assessment.title}</small>
                    </th>
                  ))}
                  <th className="result-head">70 %</th>
                  <th>Proyecto</th>
                  <th>Sumativa inicial</th>
                  <th>Mejora</th>
                  <th>Refuerzo</th>
                  <th className="result-head">30 %</th>
                  <th className="result-head">Final</th>
                  <th>Cualitativa</th>
                  <th>Aprendizaje</th>
                  <th>Comportamiento</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map(({ enrollment, result }) => {
                  const sum = summative[enrollment.id] ?? { project_score: '', initial_score: '', improvement_score: '', reinforcement_score: '' }
                  return (
                    <tr key={enrollment.id}>
                      <td className="sticky-col student-col"><strong>{fullName(enrollment.student?.first_names, enrollment.student?.last_names)}</strong></td>
                      {assessments.map((assessment) => {
                        const key = `${enrollment.id}:${assessment.id}`
                        const draft = grades[key] ?? { score: '', status: 'pending' as const }
                        return (
                          <td key={assessment.id}>
                            <input
                              className="score-input"
                              type="number"
                              min="0"
                              max="10"
                              step="0.01"
                              value={draft.score}
                              disabled={!canEdit}
                              onChange={(event) => setGrades({ ...grades, [key]: { score: event.target.value, status: event.target.value === '' ? 'pending' : 'graded' } })}
                            />
                          </td>
                        )
                      })}
                      <td className="calculated-cell">{formatScore(result?.weighted_70)}</td>
                      {(['project_score', 'initial_score', 'improvement_score', 'reinforcement_score'] as const).map((field) => (
                        <td key={field}>
                          <input
                            className="score-input"
                            type="number"
                            min="0"
                            max="10"
                            step="0.01"
                            value={sum[field]}
                            disabled={!canEdit}
                            onChange={(event) => setSummative({ ...summative, [enrollment.id]: { ...sum, [field]: event.target.value } })}
                          />
                        </td>
                      ))}
                      <td className="calculated-cell">{formatScore(result?.weighted_30)}</td>
                      <td className="calculated-cell final-score">{formatScore(result?.final_score)}</td>
                      <td><span className="badge badge-primary">{result?.alphabetic_scale || '—'}</span></td>
                      <td><span className="badge badge-muted">{result?.learning_scale || '—'}</span></td>
                      <td>
                        <select
                          className="behavior-select"
                          value={behavior[enrollment.id] ?? ''}
                          disabled={!canEdit}
                          onChange={(event) => setBehavior({ ...behavior, [enrollment.id]: event.target.value })}
                        >
                          <option value="">—</option>
                          {['A', 'B', 'C', 'D', 'E'].map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
                {!enrollments.length && <tr><td colSpan={assessments.length + 11} className="empty-cell">No existen estudiantes matriculados en este curso.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={assessmentOpen} title="Nueva evaluación formativa" onClose={() => setAssessmentOpen(false)}>
        <div className="form-grid">
          <label className="field full-span">
            <span>Tipo de evaluación</span>
            <select value={assessmentDraft.assessment_type_id} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, assessment_type_id: event.target.value })}>
              <option value="">Seleccione</option>
              {assessmentTypes.map((type) => <option key={type.id} value={type.id}>{type.code} · {type.name}</option>)}
            </select>
          </label>
          <label className="field full-span"><span>Título o descripción</span><input value={assessmentDraft.title} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, title: event.target.value })} placeholder="Ej.: Taller sobre fracciones" /></label>
          <label className="field full-span"><span>Fecha</span><input type="date" value={assessmentDraft.assessment_date} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, assessment_date: event.target.value })} /></label>
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setAssessmentOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createAssessment().catch((error) => setNotice(errorMessage(error)))}>Crear evaluación</button></div>
        </div>
      </Modal>
    </>
  )
}
