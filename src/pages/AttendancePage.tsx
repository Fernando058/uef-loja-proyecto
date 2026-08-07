import { Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { AcademicYear, AttendanceSummary, Course, Enrollment, Term } from '../types/domain'

interface AttendanceDraft {
  attended_days: string
  justified_absences: string
  unjustified_absences: string
  notes: string
}

const emptyDraft = (): AttendanceDraft => ({
  attended_days: '0',
  justified_absences: '0',
  unjustified_absences: '0',
  notes: '',
})

const toNonNegativeInteger = (value: string) => {
  const parsed = Number.parseInt(value || '0', 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function AttendancePage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({})
  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [termId, setTermId] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBase = useCallback(async () => {
    const [yearRes, courseRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('starts_on', { ascending: false }),
      supabase.from('courses').select('*').order('grade_level').order('parallel'),
    ])
    if (yearRes.error) throw yearRes.error
    if (courseRes.error) throw courseRes.error

    const yearRows = (yearRes.data ?? []) as AcademicYear[]
    setYears(yearRows)
    setCourses((courseRes.data ?? []) as Course[])
    setYearId((current) => current || yearRows.find((item) => item.active)?.id || yearRows[0]?.id || '')
  }, [])

  useEffect(() => {
    void loadBase().catch((error) => setNotice(errorMessage(error)))
  }, [loadBase])

  const yearCourses = useMemo(
    () => courses.filter((course) => course.academic_year_id === yearId),
    [courses, yearId],
  )

  useEffect(() => {
    if (!yearId) return

    const loadYear = async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('academic_year_id', yearId)
        .order('order_no')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      setTermId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id || '')
      setCourseId((current) => yearCourses.some((item) => item.id === current) ? current : yearCourses[0]?.id || '')
    }

    void loadYear().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, yearCourses])

  const loadAttendance = useCallback(async () => {
    if (!yearId || !courseId || !termId) {
      setEnrollments([])
      setDrafts({})
      return
    }

    const { data: enrollmentData, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('*,student:students(*)')
      .eq('academic_year_id', yearId)
      .eq('course_id', courseId)
      .neq('status', 'transferred')

    if (enrollmentError) throw enrollmentError

    const enrollmentRows = ((enrollmentData ?? []) as Enrollment[]).sort((a, b) =>
      fullName(a.student?.first_names, a.student?.last_names)
        .localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'),
    )
    setEnrollments(enrollmentRows)

    const ids = enrollmentRows.map((item) => item.id)
    let attendanceRows: AttendanceSummary[] = []
    if (ids.length) {
      const { data, error } = await supabase
        .from('attendance_summaries')
        .select('*')
        .eq('term_id', termId)
        .in('enrollment_id', ids)
      if (error) throw error
      attendanceRows = (data ?? []) as AttendanceSummary[]
    }

    const nextDrafts: Record<string, AttendanceDraft> = {}
    for (const enrollment of enrollmentRows) {
      const row = attendanceRows.find((item) => item.enrollment_id === enrollment.id)
      nextDrafts[enrollment.id] = row
        ? {
            attended_days: String(row.attended_days),
            justified_absences: String(row.justified_absences),
            unjustified_absences: String(row.unjustified_absences),
            notes: row.notes ?? '',
          }
        : emptyDraft()
    }
    setDrafts(nextDrafts)
  }, [yearId, courseId, termId])

  useEffect(() => {
    void loadAttendance().catch((error) => setNotice(errorMessage(error)))
  }, [loadAttendance])

  const updateDraft = (enrollmentId: string, patch: Partial<AttendanceDraft>) => {
    setDrafts((current) => ({
      ...current,
      [enrollmentId]: { ...(current[enrollmentId] ?? emptyDraft()), ...patch },
    }))
  }

  const saveAll = async () => {
    if (!canEdit || !termId) return
    setSaving(true)
    setNotice('')
    try {
      const payload = enrollments.map((enrollment) => {
        const draft = drafts[enrollment.id] ?? emptyDraft()
        return {
          enrollment_id: enrollment.id,
          term_id: termId,
          attended_days: toNonNegativeInteger(draft.attended_days),
          justified_absences: toNonNegativeInteger(draft.justified_absences),
          unjustified_absences: toNonNegativeInteger(draft.unjustified_absences),
          notes: draft.notes.trim() || null,
        }
      })

      if (payload.length) {
        const { error } = await supabase
          .from('attendance_summaries')
          .upsert(payload, { onConflict: 'enrollment_id,term_id' })
        if (error) throw error
      }

      setNotice('Asistencia resumida guardada correctamente.')
      await loadAttendance()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Asistencia resumida"
        description="Registre al finalizar cada trimestre los días asistidos y las faltas justificadas e injustificadas."
        actions={canEdit ? (
          <button className="button button-primary" onClick={() => void saveAll().catch((error) => setNotice(errorMessage(error)))} disabled={saving || !enrollments.length}>
            <Save size={17} /> {saving ? 'Guardando…' : 'Guardar curso'}
          </button>
        ) : undefined}
      />

      {notice && <div className="alert alert-info">{notice}</div>}
      {!canEdit && <div className="alert alert-warning">La cuenta docente puede consultar la asistencia de sus cursos; la edición corresponde al director.</div>}

      <section className="panel filters-panel print-hide">
        <div className="filter-grid filter-grid-4">
          <label className="field">
            <span>Año lectivo</span>
            <select value={yearId} onChange={(event) => setYearId(event.target.value)}>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Curso</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {yearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level} “{course.parallel}”</option>)}
            </select>
          </label>
          <label className="field">
            <span>Trimestre</span>
            <select value={termId} onChange={(event) => setTermId(event.target.value)}>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
          <div className="attendance-help">
            <strong>{enrollments.length}</strong>
            <span>estudiantes</span>
          </div>
        </div>
      </section>

      <section className="panel attendance-panel">
        <div className="panel-heading">
          <div>
            <h2>Totales del trimestre</h2>
            <p>Los valores pueden completarse o corregirse posteriormente por el director.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Días asistidos</th>
                <th>Faltas justificadas</th>
                <th>Faltas injustificadas</th>
                <th>Total registrado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enrollment) => {
                const draft = drafts[enrollment.id] ?? emptyDraft()
                const total = toNonNegativeInteger(draft.attended_days)
                  + toNonNegativeInteger(draft.justified_absences)
                  + toNonNegativeInteger(draft.unjustified_absences)
                return (
                  <tr key={enrollment.id}>
                    <td><strong>{fullName(enrollment.student?.first_names, enrollment.student?.last_names)}</strong></td>
                    <td><input className="attendance-input" type="number" min="0" disabled={!canEdit} value={draft.attended_days} onChange={(event) => updateDraft(enrollment.id, { attended_days: event.target.value })} /></td>
                    <td><input className="attendance-input" type="number" min="0" disabled={!canEdit} value={draft.justified_absences} onChange={(event) => updateDraft(enrollment.id, { justified_absences: event.target.value })} /></td>
                    <td><input className="attendance-input" type="number" min="0" disabled={!canEdit} value={draft.unjustified_absences} onChange={(event) => updateDraft(enrollment.id, { unjustified_absences: event.target.value })} /></td>
                    <td><strong>{total}</strong></td>
                    <td><input className="attendance-notes" disabled={!canEdit} value={draft.notes} onChange={(event) => updateDraft(enrollment.id, { notes: event.target.value })} placeholder="Opcional" /></td>
                  </tr>
                )
              })}
              {!enrollments.length && <tr><td colSpan={6} className="empty-cell">Seleccione un curso con estudiantes matriculados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
