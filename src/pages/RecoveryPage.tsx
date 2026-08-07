import { RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { AnnualSubjectResult, Enrollment, TeacherAssignment } from '../types/domain'

export function RecoveryPage() {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [assignmentId, setAssignmentId] = useState('')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [annual, setAnnual] = useState<Record<string, AnnualSubjectResult>>({})
  const [scores, setScores] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = assignments.find((item) => item.id === assignmentId)

  const loadAssignments = useCallback(async () => {
    const { data, error } = await supabase
      .from('teacher_assignments')
      .select('*,course:courses(*),subject:subjects(*),teacher:teachers(*)')
      .eq('active', true)
    if (error) throw error
    const rows = (data ?? []) as TeacherAssignment[]
    setAssignments(rows)
    if (!assignmentId && rows[0]) setAssignmentId(rows[0].id)
  }, [assignmentId])

  useEffect(() => {
    void loadAssignments().catch((error) => setNotice(errorMessage(error)))
  }, [loadAssignments])

  const load = useCallback(async () => {
    if (!selected) return
    const [enrollmentRes, annualRes, recoveryRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('*,student:students(*)')
        .eq('academic_year_id', selected.academic_year_id)
        .eq('course_id', selected.course_id)
        .neq('status', 'transferred'),
      supabase.from('v_annual_subject_results').select('*').eq('teacher_assignment_id', selected.id),
      supabase.from('recovery_records').select('*').eq('teacher_assignment_id', selected.id),
    ])
    const firstError = [enrollmentRes, annualRes, recoveryRes].find((item) => item.error)?.error
    if (firstError) throw firstError
    const enrollmentRows = ((enrollmentRes.data ?? []) as Enrollment[]).sort((a, b) => fullName(a.student?.first_names, a.student?.last_names).localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'))
    setEnrollments(enrollmentRows)
    setAnnual(Object.fromEntries(((annualRes.data ?? []) as AnnualSubjectResult[]).map((item) => [item.enrollment_id, item])))
    setScores(Object.fromEntries((recoveryRes.data ?? []).map((item: any) => [item.enrollment_id, String(item.score)])))
  }, [selected])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const save = async () => {
    if (!selected) return
    const payload = Object.entries(scores)
      .filter(([, value]) => value.trim() !== '')
      .map(([enrollment_id, value]) => ({
        enrollment_id,
        teacher_assignment_id: selected.id,
        score: Math.min(10, Math.max(0, Number(value))),
      }))
    setSaving(true)
    try {
      if (payload.length) {
        const { error } = await supabase.from('recovery_records').upsert(payload, { onConflict: 'enrollment_id,teacher_assignment_id' })
        if (error) throw error
      }
      setNotice('Notas de recuperación guardadas.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Recuperación anual"
        description="Registre la nota de recuperación como un valor independiente. La nota final se calcula promediando el resultado anual y la recuperación cuando esta exista."
        actions={<div className="button-row"><button className="button button-light" onClick={() => void load().catch((error) => setNotice(errorMessage(error)))}><RefreshCw size={17} /> Actualizar</button><button className="button button-primary" disabled={saving} onClick={() => void save().catch((error) => setNotice(errorMessage(error)))}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar'}</button></div>}
      />
      {notice && <div className="alert alert-info">{notice}</div>}
      <section className="panel filters-panel">
        <label className="field"><span>Curso y materia</span><select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="">Seleccione</option>{assignments.map((item) => <option key={item.id} value={item.id}>{item.course?.grade_level} “{item.course?.parallel}” · {item.subject?.name}</option>)}</select></label>
      </section>
      <section className="panel">
        <div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>T1</th><th>T2</th><th>T3</th><th>Promedio anual</th><th>Recuperación</th><th>Nota final</th><th>Resultado</th></tr></thead><tbody>
          {enrollments.map((enrollment) => {
            const result = annual[enrollment.id]
            const recoveryValue = scores[enrollment.id] ?? ''
            const annualScore = result?.annual_average
            const previewFinal = recoveryValue === '' ? annualScore : annualScore == null ? Number(recoveryValue) : (Number(annualScore) + Number(recoveryValue)) / 2
            return <tr key={enrollment.id}><td><strong>{fullName(enrollment.student?.first_names, enrollment.student?.last_names)}</strong></td><td>{formatScore(result?.term_1)}</td><td>{formatScore(result?.term_2)}</td><td>{formatScore(result?.term_3)}</td><td>{formatScore(annualScore)}</td><td><input className="score-input" type="number" min="0" max="10" step="0.01" value={recoveryValue} onChange={(event) => setScores({ ...scores, [enrollment.id]: event.target.value })} /></td><td><strong>{formatScore(previewFinal)}</strong></td><td>{result?.learning_scale || '—'}</td></tr>
          })}
          {!enrollments.length && <tr><td colSpan={8} className="empty-cell">No existen estudiantes para esta asignación.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  )
}
