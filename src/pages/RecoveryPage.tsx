import { RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { AcademicYear, Course, Enrollment, Subject, SupplementaryEligibility } from '../types/domain'

export function RecoveryPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [eligibility, setEligibility] = useState<SupplementaryEligibility[]>([])
  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [scores, setScores] = useState<Record<string, string>>({})
  const [dates, setDates] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBase = useCallback(async () => {
    const [yearRes, courseRes, subjectRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
      supabase.from('courses').select('*,grade_level:grade_levels(*)').eq('active', true),
      supabase.from('subjects').select('*').eq('kind', 'quantitative').order('sort_order'),
    ])
    const firstError = [yearRes, courseRes, subjectRes].find((item) => item.error)?.error
    if (firstError) throw firstError
    const yearRows = (yearRes.data ?? []) as AcademicYear[]
    setYears(yearRows)
    setCourses((courseRes.data ?? []) as Course[])
    setSubjects((subjectRes.data ?? []) as Subject[])
    if (!yearId) setYearId(yearRows.find((item) => item.active)?.id ?? yearRows[0]?.id ?? '')
  }, [yearId])

  useEffect(() => { void loadBase().catch((error) => setNotice(errorMessage(error))) }, [loadBase])

  useEffect(() => {
    const yearCourses = courses.filter((item) => item.academic_year_id === yearId && item.grade_level?.sublevel === 'media')
    if (!yearCourses.some((item) => item.id === courseId)) setCourseId(yearCourses[0]?.id ?? '')
  }, [courses, yearId, courseId])

  const load = useCallback(async () => {
    if (!yearId || !courseId) { setEligibility([]); setEnrollments([]); return }
    const [eligibilityRes, enrollmentRes] = await Promise.all([
      supabase.from('v_supplementary_eligibility').select('*').eq('academic_year_id', yearId).eq('course_id', courseId).eq('eligible', true),
      supabase.from('enrollments').select('*,student:students(*)').eq('academic_year_id', yearId).eq('course_id', courseId).in('status', ['active', 'completed']),
    ])
    if (eligibilityRes.error) throw eligibilityRes.error
    if (enrollmentRes.error) throw enrollmentRes.error
    const rows = (eligibilityRes.data ?? []) as SupplementaryEligibility[]
    setEligibility(rows)
    setEnrollments((enrollmentRes.data ?? []) as Enrollment[])
    setScores(Object.fromEntries(rows.map((item) => [`${item.enrollment_id}:${item.subject_id}`, item.exam_score == null ? '' : String(item.exam_score)])))
    setDates(Object.fromEntries(rows.map((item) => [`${item.enrollment_id}:${item.subject_id}`, item.exam_date ?? ''])))
  }, [yearId, courseId])

  useEffect(() => { void load().catch((error) => setNotice(errorMessage(error))) }, [load])

  const rows = useMemo(() => eligibility.map((item) => ({
    ...item,
    student: enrollments.find((enrollment) => enrollment.id === item.enrollment_id)?.student,
    subject: subjects.find((subject) => subject.id === item.subject_id),
  })).sort((a, b) => fullName(a.student?.first_names, a.student?.last_names).localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es') || (a.subject?.name ?? '').localeCompare(b.subject?.name ?? '', 'es')), [eligibility, enrollments, subjects])

  const save = async () => {
    if (!profile || !canEdit) return
    setSaving(true)
    try {
      for (const row of rows) {
        const key = `${row.enrollment_id}:${row.subject_id}`
        const value = scores[key] ?? ''
        if (!value.trim()) continue
        const score = Number(value)
        if (!Number.isFinite(score) || score < 1 || score > 10) throw new Error('La nota supletoria debe estar entre 1,00 y 10,00.')
        const { error } = await supabase.from('supplementary_exams').upsert({ enrollment_id: row.enrollment_id, subject_id: row.subject_id, exam_score: score, exam_date: dates[key] || null, updated_by: profile.id }, { onConflict: 'enrollment_id,subject_id' })
        if (error) throw error
      }
      setNotice('Evaluaciones supletorias guardadas. La nota final de promoción se resolverá en la fase normativa de promoción.')
      await load()
    } finally { setSaving(false) }
  }

  const yearCourses = courses.filter((item) => item.academic_year_id === yearId && item.grade_level?.sublevel === 'media')

  return <>
    <PageHeader title="Evaluación supletoria" description="El sistema habilita automáticamente asignaturas de EGB Media con promedio anual entre 4,01 y 6,99." actions={<div className="button-row"><button className="button button-light" onClick={() => void load().catch((error) => setNotice(errorMessage(error)))}><RefreshCw size={17} /> Actualizar</button>{canEdit && <button className="button button-primary" disabled={saving} onClick={() => void save().catch((error) => setNotice(errorMessage(error)))}><Save size={17} /> {saving ? 'Guardando…' : 'Guardar'}</button>}</div>} />
    {notice && <div className="alert alert-info">{notice}</div>}
    <div className="alert alert-warning">Esta pantalla registra el examen supletorio, pero todavía no decide promoción/repitencia ni sustituye automáticamente la nota final.</div>
    <section className="panel filters-panel"><div className="filter-grid"><label className="field"><span>Año lectivo</span><select value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label className="field"><span>Curso de EGB Media</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Seleccione</option>{yearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level?.name} “{course.parallel}”</option>)}</select></label></div></section>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>Asignatura</th><th>Promedio anual</th><th>Rango</th><th>Nota supletoria</th><th>Fecha</th></tr></thead><tbody>
      {rows.map((row) => { const key = `${row.enrollment_id}:${row.subject_id}`; return <tr key={key}><td><strong>{fullName(row.student?.first_names, row.student?.last_names)}</strong></td><td>{row.subject?.name ?? '—'}</td><td>{formatScore(row.annual_score)}</td><td><span className="badge badge-warning">4,01–6,99</span></td><td><input className="score-input" type="number" min="1" max="10" step="0.01" disabled={!canEdit} value={scores[key] ?? ''} onChange={(event) => setScores({ ...scores, [key]: event.target.value })} /></td><td><input className="date-input-compact" type="date" disabled={!canEdit} value={dates[key] ?? ''} onChange={(event) => setDates({ ...dates, [key]: event.target.value })} /></td></tr> })}
      {!rows.length && <tr><td colSpan={6} className="empty-cell">No existen estudiantes habilitados para supletorio en el curso seleccionado.</td></tr>}
    </tbody></table></div></section>
  </>
}
