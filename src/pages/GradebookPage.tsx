import { Pencil, Plus, RefreshCw, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  Assessment,
  AssessmentActivityType,
  AssessmentCategory,
  AssessmentGrade,
  Enrollment,
  TeacherAssignment,
  Term,
  TermSubjectResult,
} from '../types/domain'

interface AssessmentDraft {
  activity_type_id: string
  title: string
  category: AssessmentCategory
  assessment_date: string
  active: boolean
}

interface ImprovementDraft {
  direct_improvement_score: string
  reinforcement_score: string
  reinforced_improvement_score: string
  notes: string
}

const emptyAssessment: AssessmentDraft = { activity_type_id: '', title: '', category: 'formative', assessment_date: '', active: true }
const trunc2 = (value: number) => Math.trunc((value + Number.EPSILON) * 100) / 100
const parseScore = (value: string) => {
  if (value.trim() === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1 || number > 10) throw new Error('Las calificaciones deben estar entre 1,00 y 10,00.')
  return number
}

const databaseErrorText = (error: unknown, context: string) => {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [
      candidate.message,
      candidate.details,
      candidate.hint,
      candidate.code ? `Código ${candidate.code}` : '',
    ].filter(Boolean)
    if (parts.length) return `${context}: ${parts.join(' · ')}`
  }
  return `${context}: ${errorMessage(error)}`
}

export function GradebookPage() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [activityTypes, setActivityTypes] = useState<AssessmentActivityType[]>([])
  const [assignmentId, setAssignmentId] = useState('')
  const [termId, setTermId] = useState('')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [gradeRows, setGradeRows] = useState<AssessmentGrade[]>([])
  const [scores, setScores] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, TermSubjectResult>>({})
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null)
  const [assessmentDraft, setAssessmentDraft] = useState<AssessmentDraft>(emptyAssessment)

  const [improvementOpen, setImprovementOpen] = useState(false)
  const [improvementGrade, setImprovementGrade] = useState<{ assessment: Assessment; enrollment: Enrollment; grade: AssessmentGrade } | null>(null)
  const [improvementDraft, setImprovementDraft] = useState<ImprovementDraft>({ direct_improvement_score: '', reinforcement_score: '', reinforced_improvement_score: '', notes: '' })

  const selectedAssignment = assignments.find((item) => item.id === assignmentId)
  const selectedTerm = terms.find((item) => item.id === termId)
  const evaluationModel = selectedAssignment?.course?.grade_level?.evaluation_model
  const isElemental = evaluationModel === 'simple_average'
  const canEdit = !selectedTerm?.closed

  const loadSelectors = useCallback(async () => {
    const [assignmentRes, typeRes] = await Promise.all([
      supabase.from('teacher_assignments').select('*,course:courses(*,grade_level:grade_levels(*)),subject:subjects(*),teacher:teachers(*)').eq('active', true),
      supabase.from('assessment_activity_types').select('*').eq('active', true).order('sort_order'),
    ])
    if (assignmentRes.error) throw assignmentRes.error
    if (typeRes.error) throw typeRes.error

    let rows = (assignmentRes.data ?? []) as TeacherAssignment[]
    rows = rows.filter((item) => item.subject?.kind === 'quantitative')
    if (profile?.role === 'docente') rows = rows.filter((item) => item.teacher?.profile_id === profile.id)
    rows.sort((a, b) => `${a.course?.grade_level?.ordinal ?? 99}${a.course?.parallel}${a.subject?.name}`.localeCompare(`${b.course?.grade_level?.ordinal ?? 99}${b.course?.parallel}${b.subject?.name}`, 'es'))

    setAssignments(rows)
    setActivityTypes((typeRes.data ?? []) as AssessmentActivityType[])
    if (!rows.some((item) => item.id === assignmentId)) setAssignmentId(rows[0]?.id ?? '')
  }, [assignmentId, profile])

  useEffect(() => { void loadSelectors().catch((error) => setNotice(errorMessage(error))) }, [loadSelectors])

  useEffect(() => {
    if (!selectedAssignment) { setTerms([]); setTermId(''); return }
    const run = async () => {
      const { data, error } = await supabase.from('terms').select('*').eq('academic_year_id', selectedAssignment.academic_year_id).order('number')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      if (!rows.some((item) => item.id === termId)) setTermId(rows[0]?.id ?? '')
    }
    void run().catch((error) => setNotice(errorMessage(error)))
  }, [selectedAssignment, termId])

  const loadGradebook = useCallback(async () => {
    if (!selectedAssignment || !termId) return
    setLoading(true)
    setNotice('')

    try {
      // Matrículas y evaluaciones son los datos indispensables para dibujar
      // el libro. Se cargan primero; una falla en la vista de resultados no
      // debe ocultar estudiantes ni notas ya existentes.
      const [enrollmentRes, assessmentRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('*,student:students(*)')
          .eq('academic_year_id', selectedAssignment.academic_year_id)
          .eq('course_id', selectedAssignment.course_id)
          .in('status', ['active', 'completed']),
        supabase
          .from('assessments')
          .select('*,activity_type:assessment_activity_types(*)')
          .eq('academic_year_id', selectedAssignment.academic_year_id)
          .eq('course_id', selectedAssignment.course_id)
          .eq('subject_id', selectedAssignment.subject_id)
          .eq('term_id', termId)
          .order('assessment_date')
          .order('created_at'),
      ])

      if (enrollmentRes.error) {
        throw new Error(databaseErrorText(enrollmentRes.error, 'Error cargando matrículas'))
      }
      if (assessmentRes.error) {
        throw new Error(databaseErrorText(assessmentRes.error, 'Error cargando evaluaciones'))
      }

      const enrollmentRows = ((enrollmentRes.data ?? []) as Enrollment[]).sort((a, b) =>
        fullName(a.student?.first_names, a.student?.last_names)
          .localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'),
      )
      const assessmentRows = (assessmentRes.data ?? []) as Assessment[]

      setEnrollments(enrollmentRows)
      setAssessments(assessmentRows)

      // Cargar las notas aun si la vista calculada presentara un problema.
      const ids = assessmentRows.map((item) => item.id)
      let rows: AssessmentGrade[] = []

      if (ids.length) {
        const gradeRes = await supabase
          .from('assessment_grades')
          .select('*')
          .in('assessment_id', ids)

        if (gradeRes.error) {
          throw new Error(databaseErrorText(gradeRes.error, 'Error cargando calificaciones'))
        }

        rows = (gradeRes.data ?? []) as AssessmentGrade[]
      }

      setGradeRows(rows)

      const map: Record<string, string> = {}
      for (const enrollment of enrollmentRows) {
        for (const assessment of assessmentRows) {
          const current = rows.find(
            (grade) =>
              grade.enrollment_id === enrollment.id
              && grade.assessment_id === assessment.id,
          )
          map[`${enrollment.id}:${assessment.id}`] =
            current?.initial_score == null ? '' : String(current.initial_score)
        }
      }
      setScores(map)

      // Resultados calculados. Si esta vista falla, el libro sigue mostrando
      // matrículas/evaluaciones/notas y comunica el error concreto.
      const resultRes = await supabase.rpc('get_subject_term_results_v2', {
        p_course_id: selectedAssignment.course_id,
        p_term_id: termId,
        p_subject_id: selectedAssignment.subject_id,
        p_enrollment_id: null,
      })

      if (resultRes.error) {
        setResults({})
        setNotice(
          databaseErrorText(
            resultRes.error,
            `Se cargaron ${enrollmentRows.length} estudiante(s) y ${assessmentRows.length} evaluación(es), pero falló el cálculo de promedios`,
          ),
        )
      } else {
        setResults(
          Object.fromEntries(
            ((resultRes.data ?? []) as TermSubjectResult[])
              .map((item) => [item.enrollment_id, item]),
          ),
        )

        if (!enrollmentRows.length) {
          setNotice(
            'No hay matrículas activas/completadas para este curso y año lectivo. '
            + 'Revise la carga de datos o ejecute la consulta diagnóstica del dataset de prueba.',
          )
        } else if (!assessmentRows.length) {
          setNotice(
            `${enrollmentRows.length} estudiante(s) cargados, pero no existen evaluaciones para esta asignatura y trimestre.`,
          )
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : databaseErrorText(error, 'Libro de calificaciones'))
    } finally {
      setLoading(false)
    }
  }, [selectedAssignment, termId])

  useEffect(() => { void loadGradebook().catch((error) => setNotice(errorMessage(error))) }, [loadGradebook])

  const openNewAssessment = () => {
    setEditingAssessment(null)
    setAssessmentDraft(emptyAssessment)
    setAssessmentOpen(true)
  }

  const openEditAssessment = (assessment: Assessment) => {
    setEditingAssessment(assessment)
    setAssessmentDraft({ activity_type_id: assessment.activity_type_id ?? '', title: assessment.title, category: assessment.category, assessment_date: assessment.assessment_date ?? '', active: assessment.active })
    setAssessmentOpen(true)
  }

  const selectActivityType = (activityTypeId: string) => {
    const type = activityTypes.find((item) => item.id === activityTypeId)
    setAssessmentDraft({ ...assessmentDraft, activity_type_id: activityTypeId, category: type?.default_category ?? assessmentDraft.category })
  }

  const saveAssessment = async () => {
    if (!selectedAssignment || !termId || !assessmentDraft.title.trim()) {
      setNotice('Complete el título de la evaluación.')
      return
    }
    const payload = {
      academic_year_id: selectedAssignment.academic_year_id,
      term_id: termId,
      course_id: selectedAssignment.course_id,
      subject_id: selectedAssignment.subject_id,
      teacher_assignment_id: selectedAssignment.id,
      activity_type_id: assessmentDraft.activity_type_id || null,
      title: assessmentDraft.title.trim(),
      category: assessmentDraft.category,
      assessment_date: assessmentDraft.assessment_date || null,
      active: assessmentDraft.active,
      created_by: profile?.id ?? null,
    }
    const query = editingAssessment ? supabase.from('assessments').update(payload).eq('id', editingAssessment.id) : supabase.from('assessments').insert(payload)
    const { error } = await query
    if (error) throw error
    setAssessmentOpen(false)
    setNotice(editingAssessment ? 'Evaluación actualizada.' : 'Evaluación creada.')
    await loadGradebook()
  }

  const saveInitialScores = async () => {
    if (!profile) return
    setSaving(true)
    try {
      for (const assessment of assessments.filter((item) => item.active)) {
        for (const enrollment of enrollments) {
          const key = `${enrollment.id}:${assessment.id}`
          const value = scores[key] ?? ''
          const current = gradeRows.find((grade) => grade.enrollment_id === enrollment.id && grade.assessment_id === assessment.id)
          if (value.trim() === '') {
            if (current?.id) {
              const { error } = await supabase.from('assessment_grades').delete().eq('id', current.id)
              if (error) throw error
            }
          } else {
            const score = parseScore(value)
            const { error } = await supabase.from('assessment_grades').upsert({ assessment_id: assessment.id, enrollment_id: enrollment.id, initial_score: score, updated_by: profile.id }, { onConflict: 'assessment_id,enrollment_id' })
            if (error) throw error
          }
        }
      }
      setNotice('Calificaciones guardadas. Las celdas vacías permanecen sin calificación y no se toman como cero.')
      await loadGradebook()
    } finally {
      setSaving(false)
    }
  }

  const openImprovement = (assessment: Assessment, enrollment: Enrollment) => {
    const grade = gradeRows.find((item) => item.assessment_id === assessment.id && item.enrollment_id === enrollment.id) ?? null
    if (!grade?.initial_score) {
      setNotice('Primero debe existir una calificación inicial.')
      return
    }
    setImprovementGrade({ assessment, enrollment, grade })
    setImprovementDraft({
      direct_improvement_score: grade.direct_improvement_score == null ? '' : String(grade.direct_improvement_score),
      reinforcement_score: grade.reinforcement_score == null ? '' : String(grade.reinforcement_score),
      reinforced_improvement_score: grade.reinforced_improvement_score == null ? '' : String(grade.reinforced_improvement_score),
      notes: grade.notes ?? '',
    })
    setImprovementOpen(true)
  }

  const improvementPreview = useMemo(() => {
    const initial = improvementGrade?.grade.initial_score
    if (initial == null) return null
    const direct = Number(improvementDraft.direct_improvement_score)
    const reinforcement = Number(improvementDraft.reinforcement_score)
    const post = Number(improvementDraft.reinforced_improvement_score)
    if (improvementDraft.reinforcement_score && improvementDraft.reinforced_improvement_score) return Math.max(initial, trunc2((initial + reinforcement + post) / 3))
    if (improvementDraft.direct_improvement_score) return Math.max(initial, trunc2((initial + direct) / 2))
    return initial
  }, [improvementDraft, improvementGrade])

  const saveImprovement = async () => {
    if (!improvementGrade?.grade.id || !profile) return
    const initial = improvementGrade.grade.initial_score
    if (initial == null) return
    const direct = parseScore(improvementDraft.direct_improvement_score)
    const reinforcement = parseScore(improvementDraft.reinforcement_score)
    const reinforced = parseScore(improvementDraft.reinforced_improvement_score)
    if (direct !== null && (reinforcement !== null || reinforced !== null)) throw new Error('Utilice mejora directa o mejora con refuerzo, no ambas al mismo tiempo.')
    const { error } = await supabase.from('assessment_grades').update({ direct_improvement_score: direct, reinforcement_score: reinforcement, reinforced_improvement_score: reinforced, notes: improvementDraft.notes.trim() || null, updated_by: profile.id }).eq('id', improvementGrade.grade.id)
    if (error) throw error
    setImprovementOpen(false)
    setNotice('Proceso de mejora actualizado.')
    await loadGradebook()
  }

  const resultRows = enrollments.map((enrollment) => ({ enrollment, result: results[enrollment.id] }))

  return <>
    <PageHeader
      title="Libro de calificaciones V2"
      description={isElemental ? 'EGB Elemental: los aportes válidos se integran mediante promedio simple.' : 'EGB Media: el sistema calcula automáticamente 70 % de evaluación formativa + 30 % de evaluación sumativa.'}
      actions={<div className="button-row"><button className="button button-light" onClick={() => void loadGradebook().catch((error) => setNotice(errorMessage(error)))}><RefreshCw size={17} /> Actualizar</button><button className="button button-primary" disabled={!canEdit || saving} onClick={() => void saveInitialScores().catch((error) => setNotice(errorMessage(error)))}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar notas'}</button></div>}
    />
    {notice && <div className="alert alert-info">{notice}</div>}
    {selectedTerm?.closed && <div className="alert alert-warning">Este trimestre está cerrado. El libro se encuentra en modo de consulta.</div>}

    <section className="panel filters-panel"><div className="filter-grid"><label className="field"><span>Curso y asignatura</span><select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="">Seleccione</option>{assignments.map((item) => <option key={item.id} value={item.id}>{item.course?.grade_level?.name} “{item.course?.parallel}” · {item.subject?.name}</option>)}</select></label><label className="field"><span>Trimestre</span><select value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">Seleccione</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}{term.closed ? ' · cerrado' : ''}</option>)}</select></label><div className="filter-action"><button className="button button-secondary" disabled={!canEdit || !selectedAssignment || !termId} onClick={openNewAssessment}><Plus size={17} /> Nueva evaluación</button></div></div></section>

    {selectedAssignment && <div className="normative-banner"><strong>{selectedAssignment.course?.grade_level?.name} · {selectedAssignment.course?.grade_level?.sublevel === 'elemental' ? 'EGB Elemental' : 'EGB Media'}</strong><span>{isElemental ? 'Modelo: promedio simple de aportes' : 'Modelo: formativa 70 % + sumativa 30 %'}</span></div>}

    <section className="panel gradebook-panel"><div className="panel-heading"><div><h2>{selectedAssignment ? `${selectedAssignment.course?.grade_level?.name} “${selectedAssignment.course?.parallel}” · ${selectedAssignment.subject?.name}` : 'Seleccione una asignación'}</h2><p>{assessments.filter((item) => item.active).length} evaluación(es) activas · {enrollments.length} estudiante(s)</p></div></div>
      {loading ? <div className="empty-cell">Cargando libro…</div> : <div className="table-wrap gradebook-scroll"><table className="gradebook-table v2-gradebook"><thead><tr><th className="sticky-col student-col">Estudiante</th>{assessments.filter((item) => item.active).map((assessment) => <th key={assessment.id}><button className="assessment-head-button" onClick={() => openEditAssessment(assessment)} title="Editar evaluación"><span className={`grade-code ${assessment.category === 'summative' ? 'sum-code' : ''}`}>{assessment.activity_type?.code ?? (assessment.category === 'summative' ? 'SUM' : 'FORM')}</span><small>{assessment.title}</small><Pencil size={12} /></button></th>)}{isElemental ? <><th className="result-head">Promedio</th><th>Cualitativa</th></> : <><th className="result-head">Prom. 70</th><th className="result-head">70 %</th><th className="result-head">Prom. 30</th><th className="result-head">30 %</th><th className="result-head">Final</th><th>Cualitativa</th></>}</tr></thead><tbody>
        {resultRows.map(({ enrollment, result }) => <tr key={enrollment.id}><td className="sticky-col student-col"><strong>{fullName(enrollment.student?.first_names, enrollment.student?.last_names)}</strong></td>{assessments.filter((item) => item.active).map((assessment) => { const key = `${enrollment.id}:${assessment.id}`; const grade = gradeRows.find((item) => item.enrollment_id === enrollment.id && item.assessment_id === assessment.id); return <td key={assessment.id}><div className="score-cell-stack"><input className="score-input" type="number" min="1" max="10" step="0.01" disabled={!canEdit} value={scores[key] ?? ''} onChange={(event) => setScores({ ...scores, [key]: event.target.value })} />{assessment.category === 'summative' && !isElemental && grade?.initial_score != null && <button className="mini-action" disabled={!canEdit} onClick={() => openImprovement(assessment, enrollment)} title="Mejora de calificación"><Sparkles size={13} />{grade.direct_improvement_score || grade.reinforcement_score ? 'Edit.' : 'Mej.'}</button>}</div></td> })}{isElemental ? <><td className="calculated-cell final-score">{formatScore(result?.term_score)}</td><td><span className="badge badge-primary">{result?.qualitative ?? '—'}</span></td></> : <><td className="calculated-cell">{formatScore(result?.formative_average)}</td><td className="calculated-cell">{result?.formative_average == null ? '—' : formatScore(trunc2(Number(result.formative_average) * .70))}</td><td className="calculated-cell">{formatScore(result?.summative_average)}</td><td className="calculated-cell">{result?.summative_average == null ? '—' : formatScore(trunc2(Number(result.summative_average) * .30))}</td><td className="calculated-cell final-score">{formatScore(result?.term_score)}</td><td><span className="badge badge-primary">{result?.qualitative ?? '—'}</span></td></>}</tr>)}
        {!enrollments.length && <tr><td colSpan={assessments.length + (isElemental ? 3 : 7)} className="empty-cell">No existen estudiantes matriculados.</td></tr>}
      </tbody></table></div>}
    </section>

    <Modal open={assessmentOpen} title={editingAssessment ? 'Editar evaluación' : 'Nueva evaluación'} onClose={() => setAssessmentOpen(false)}>
      <div className="form-grid"><label className="field full-span"><span>Tipo de actividad</span><select value={assessmentDraft.activity_type_id} onChange={(event) => selectActivityType(event.target.value)}><option value="">Sin tipo específico</option>{activityTypes.map((type) => <option key={type.id} value={type.id}>{type.code} · {type.name}</option>)}</select></label><label className="field full-span"><span>Título</span><input value={assessmentDraft.title} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, title: event.target.value })} placeholder="Ej.: Taller de fracciones" /></label><label className="field"><span>Categoría</span><select value={assessmentDraft.category} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, category: event.target.value as AssessmentCategory })}><option value="formative">Formativa</option><option value="summative">Sumativa</option></select><small>{isElemental ? 'En Elemental la categoría no cambia el promedio simple.' : 'En Media determina si aporta al 70 % o al 30 %.'}</small></label><label className="field"><span>Fecha</span><input type="date" value={assessmentDraft.assessment_date} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, assessment_date: event.target.value })} /></label><label className="check-field full-span"><input type="checkbox" checked={assessmentDraft.active} onChange={(event) => setAssessmentDraft({ ...assessmentDraft, active: event.target.checked })} /><span>Evaluación activa</span></label><div className="form-actions full-span"><button className="button button-light" onClick={() => setAssessmentOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveAssessment().catch((error) => setNotice(errorMessage(error)))}>Guardar</button></div></div>
    </Modal>

    <Modal open={improvementOpen} title="Mejora de calificación sumativa" onClose={() => setImprovementOpen(false)}>
      <div className="improvement-summary"><strong>{improvementGrade ? fullName(improvementGrade.enrollment.student?.first_names, improvementGrade.enrollment.student?.last_names) : ''}</strong><span>Nota inicial: {formatScore(improvementGrade?.grade.initial_score)}</span><span>Resultado efectivo: {formatScore(improvementPreview)}</span></div>
      {improvementGrade?.grade.initial_score != null && improvementGrade.grade.initial_score > 7 && improvementGrade.grade.initial_score < 9 ? <div className="form-grid"><div className="alert alert-info full-span">Corresponde a mejora directa: promedio simple entre la nota inicial y la nueva evaluación. Si no mejora, se conserva la inicial.</div><label className="field full-span"><span>Evaluación de mejora</span><input type="number" min="1" max="10" step="0.01" value={improvementDraft.direct_improvement_score} onChange={(event) => setImprovementDraft({ ...improvementDraft, direct_improvement_score: event.target.value, reinforcement_score: '', reinforced_improvement_score: '' })} /></label></div> : <div className="form-grid"><div className="alert alert-info full-span">Mejora con refuerzo: nota inicial + refuerzo pedagógico + evaluación posterior de mejora.</div><label className="field"><span>Calificación del refuerzo</span><input type="number" min="1" max="10" step="0.01" value={improvementDraft.reinforcement_score} onChange={(event) => setImprovementDraft({ ...improvementDraft, reinforcement_score: event.target.value, direct_improvement_score: '' })} /></label><label className="field"><span>Evaluación de mejora</span><input type="number" min="1" max="10" step="0.01" value={improvementDraft.reinforced_improvement_score} onChange={(event) => setImprovementDraft({ ...improvementDraft, reinforced_improvement_score: event.target.value, direct_improvement_score: '' })} /></label></div>}
      <label className="field full-span"><span>Observación</span><textarea rows={3} value={improvementDraft.notes} onChange={(event) => setImprovementDraft({ ...improvementDraft, notes: event.target.value })} /></label><div className="form-actions"><button className="button button-light" onClick={() => setImprovementOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void saveImprovement().catch((error) => setNotice(errorMessage(error)))}>Guardar mejora</button></div>
    </Modal>
  </>
}
