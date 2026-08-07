import { Pencil, Printer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  AnnualSubjectResult,
  AttendanceSummary,
  BehaviorCatalogItem,
  Course,
  Enrollment,
  QualitativeArea,
  QualitativeRecord,
  Term,
  TermSubjectResult,
} from '../types/domain'

type CardType = 'term' | 'annual'
type QualitativeLetter = QualitativeRecord['letter']
type BehaviorLetter = BehaviorCatalogItem['letter']

interface InstitutionSettings {
  name: string
  amie_code: string | null
  district: string | null
}

const qualitativeOptions: QualitativeLetter[] = ['A+', 'A-', 'B+', 'B-', 'C+', 'C-', 'D+', 'D-', 'E+', 'E-']

export function ReportCardsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [areas, setAreas] = useState<QualitativeArea[]>([])
  const [behaviorCatalog, setBehaviorCatalog] = useState<BehaviorCatalogItem[]>([])
  const [institution, setInstitution] = useState<InstitutionSettings>({ name: 'Unidad Educativa Fiscal Loja', amie_code: null, district: null })
  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [termId, setTermId] = useState('')
  const [cardType, setCardType] = useState<CardType>('annual')
  const [annualResults, setAnnualResults] = useState<AnnualSubjectResult[]>([])
  const [termResults, setTermResults] = useState<TermSubjectResult[]>([])
  const [attendanceByTerm, setAttendanceByTerm] = useState<Record<string, AttendanceSummary>>({})
  const [behaviorByTerm, setBehaviorByTerm] = useState<Record<string, BehaviorLetter>>({})
  const [qualitativeByKey, setQualitativeByKey] = useState<Record<string, QualitativeLetter>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTermId, setEditorTermId] = useState('')
  const [editorBehavior, setEditorBehavior] = useState<BehaviorLetter | ''>('')
  const [editorQualitative, setEditorQualitative] = useState<Record<string, QualitativeLetter | ''>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBase = useCallback(async () => {
    const [yearRes, courseRes, areaRes, behaviorRes, institutionRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('starts_on', { ascending: false }),
      supabase.from('courses').select('*').order('grade_level').order('parallel'),
      supabase.from('qualitative_areas').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('behavior_catalog').select('*').eq('active', true).order('letter'),
      supabase.from('institution_settings').select('name,amie_code,district').eq('id', 1).single(),
    ])
    const firstError = [yearRes, courseRes, areaRes, behaviorRes].find((item) => item.error)?.error
    if (firstError) throw firstError

    const yearRows = (yearRes.data ?? []) as AcademicYear[]
    setYears(yearRows)
    setCourses((courseRes.data ?? []) as Course[])
    setAreas((areaRes.data ?? []) as QualitativeArea[])
    setBehaviorCatalog((behaviorRes.data ?? []) as BehaviorCatalogItem[])
    if (institutionRes.data) setInstitution(institutionRes.data as InstitutionSettings)
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
      const { data, error } = await supabase.from('terms').select('*').eq('academic_year_id', yearId).order('order_no')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      setTermId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id || '')
      setCourseId((current) => yearCourses.some((item) => item.id === current) ? current : yearCourses[0]?.id || '')
    }
    void loadYear().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, yearCourses])

  useEffect(() => {
    if (!yearId || !courseId) {
      setEnrollments([])
      setEnrollmentId('')
      return
    }
    const loadEnrollments = async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*,student:students(*)')
        .eq('academic_year_id', yearId)
        .eq('course_id', courseId)
        .neq('status', 'transferred')
      if (error) throw error
      const rows = ((data ?? []) as Enrollment[]).sort((a, b) =>
        fullName(a.student?.first_names, a.student?.last_names)
          .localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'),
      )
      setEnrollments(rows)
      setEnrollmentId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id || '')
    }
    void loadEnrollments().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, courseId])

  const loadCard = useCallback(async () => {
    if (!enrollmentId) {
      setAnnualResults([])
      setTermResults([])
      setAttendanceByTerm({})
      setBehaviorByTerm({})
      setQualitativeByKey({})
      return
    }

    const [annualRes, termRes, attendanceRes, behaviorRes, qualitativeRes] = await Promise.all([
      supabase.from('v_annual_subject_results').select('*').eq('enrollment_id', enrollmentId).order('subject_name'),
      supabase.from('v_term_subject_results').select('*').eq('enrollment_id', enrollmentId).order('term_order').order('subject_name'),
      supabase.from('attendance_summaries').select('*').eq('enrollment_id', enrollmentId),
      supabase.from('behavior_records').select('term_id,letter').eq('enrollment_id', enrollmentId),
      supabase.from('qualitative_records').select('*').eq('enrollment_id', enrollmentId),
    ])
    const firstError = [annualRes, termRes, attendanceRes, behaviorRes, qualitativeRes].find((item) => item.error)?.error
    if (firstError) throw firstError

    setAnnualResults((annualRes.data ?? []) as AnnualSubjectResult[])
    setTermResults((termRes.data ?? []) as TermSubjectResult[])
    setAttendanceByTerm(Object.fromEntries(((attendanceRes.data ?? []) as AttendanceSummary[]).map((item) => [item.term_id, item])))
    setBehaviorByTerm(Object.fromEntries(((behaviorRes.data ?? []) as Array<{ term_id: string; letter: BehaviorLetter }>).map((item) => [item.term_id, item.letter])))
    setQualitativeByKey(Object.fromEntries(((qualitativeRes.data ?? []) as QualitativeRecord[]).map((item) => [`${item.term_id}:${item.area_id}`, item.letter])))
  }, [enrollmentId])

  useEffect(() => {
    void loadCard().catch((error) => setNotice(errorMessage(error)))
  }, [loadCard])

  const selectedEnrollment = enrollments.find((item) => item.id === enrollmentId)
  const selectedStudent = selectedEnrollment?.student
  const selectedCourse = courses.find((item) => item.id === courseId)
  const selectedYear = years.find((item) => item.id === yearId)
  const selectedTerm = terms.find((item) => item.id === termId)
  const selectedTermRows = termResults.filter((item) => item.term_id === termId)

  const annualAverage = useMemo(() => {
    const values = annualResults
      .map((item) => item.final_score)
      .filter((value): value is number => value !== null)
      .map(Number)
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  }, [annualResults])

  const annualAttendance = useMemo(() => {
    return Object.values(attendanceByTerm).reduce(
      (acc, item) => ({
        attended_days: acc.attended_days + Number(item.attended_days || 0),
        justified_absences: acc.justified_absences + Number(item.justified_absences || 0),
        unjustified_absences: acc.unjustified_absences + Number(item.unjustified_absences || 0),
      }),
      { attended_days: 0, justified_absences: 0, unjustified_absences: 0 },
    )
  }, [attendanceByTerm])

  const behaviorDescription = (term: Term) => {
    const letter = behaviorByTerm[term.id]
    if (!letter) return 'Sin registrar'
    return behaviorCatalog.find((item) => item.letter === letter)?.description || letter
  }

  const openEditor = () => {
    const targetTerm = termId || terms[0]?.id || ''
    setEditorTermId(targetTerm)
    setEditorBehavior(behaviorByTerm[targetTerm] || '')
    setEditorQualitative(Object.fromEntries(areas.map((area) => [area.id, qualitativeByKey[`${targetTerm}:${area.id}`] || ''])))
    setEditorOpen(true)
  }

  const changeEditorTerm = (nextTermId: string) => {
    setEditorTermId(nextTermId)
    setEditorBehavior(behaviorByTerm[nextTermId] || '')
    setEditorQualitative(Object.fromEntries(areas.map((area) => [area.id, qualitativeByKey[`${nextTermId}:${area.id}`] || ''])))
  }

  const saveComplementary = async () => {
    if (!canEdit || !enrollmentId || !editorTermId || !courseId) return
    setSaving(true)
    setNotice('')
    try {
      if (editorBehavior) {
        const { error } = await supabase.from('behavior_records').upsert({
          enrollment_id: enrollmentId,
          course_id: courseId,
          term_id: editorTermId,
          letter: editorBehavior,
          notes: null,
        }, { onConflict: 'enrollment_id,term_id' })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('behavior_records')
          .delete()
          .eq('enrollment_id', enrollmentId)
          .eq('term_id', editorTermId)
        if (error) throw error
      }

      const qualitativePayload = areas
        .filter((area) => editorQualitative[area.id])
        .map((area) => ({
          area_id: area.id,
          enrollment_id: enrollmentId,
          term_id: editorTermId,
          letter: editorQualitative[area.id],
          notes: null,
        }))

      if (qualitativePayload.length) {
        const { error } = await supabase
          .from('qualitative_records')
          .upsert(qualitativePayload, { onConflict: 'area_id,enrollment_id,term_id' })
        if (error) throw error
      }

      const emptyAreaIds = areas.filter((area) => !editorQualitative[area.id]).map((area) => area.id)
      if (emptyAreaIds.length) {
        const { error } = await supabase
          .from('qualitative_records')
          .delete()
          .eq('enrollment_id', enrollmentId)
          .eq('term_id', editorTermId)
          .in('area_id', emptyAreaIds)
        if (error) throw error
      }

      setEditorOpen(false)
      setNotice('Valoraciones complementarias actualizadas.')
      await loadCard()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Boletas individuales"
        description="Genere boletas parciales por trimestre o el consolidado anual del estudiante."
        actions={<button className="button button-light" onClick={() => window.print()}><Printer size={17} /> Imprimir / PDF</button>}
      />
      {notice && <div className="alert alert-info">{notice}</div>}

      <section className="panel filters-panel print-hide">
        <div className="filter-grid filter-grid-4">
          <label className="field"><span>Año lectivo</span><select value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label className="field"><span>Curso</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{yearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level} “{course.parallel}”</option>)}</select></label>
          <label className="field"><span>Estudiante</span><select value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>{enrollments.map((item) => <option key={item.id} value={item.id}>{fullName(item.student?.first_names, item.student?.last_names)}</option>)}</select></label>
          <label className="field"><span>Tipo de boleta</span><select value={cardType} onChange={(event) => setCardType(event.target.value as CardType)}><option value="annual">Anual</option><option value="term">Parcial / trimestral</option></select></label>
          {cardType === 'term' && <label className="field"><span>Trimestre</span><select value={termId} onChange={(event) => setTermId(event.target.value)}>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>}
          {canEdit && <div className="filter-action"><button className="button button-secondary" onClick={openEditor} disabled={!enrollmentId}><Pencil size={17} /> Editar complementarios</button></div>}
        </div>
      </section>

      <article className="report-card-sheet">
        <header className="report-card-header">
          <p>{institution.name}</p>
          <h1>{cardType === 'annual' ? 'BOLETA ANUAL DE CALIFICACIONES' : 'BOLETA PARCIAL DE CALIFICACIONES'}</h1>
          <div className="report-card-meta">
            <span><strong>Estudiante:</strong> {fullName(selectedStudent?.first_names, selectedStudent?.last_names)}</span>
            <span><strong>Cédula:</strong> {selectedStudent?.national_id || 'Pendiente'}</span>
            <span><strong>Año lectivo:</strong> {selectedYear?.name || '—'}</span>
            <span><strong>Curso:</strong> {selectedCourse ? `${selectedCourse.grade_level} “${selectedCourse.parallel}”` : '—'}</span>
            {institution.amie_code && <span><strong>AMIE:</strong> {institution.amie_code}</span>}
            {cardType === 'term' && <span><strong>Periodo:</strong> {selectedTerm?.name || '—'}</span>}
          </div>
        </header>

        {cardType === 'annual' ? (
          <>
            <div className="report-card-table-wrap">
              <table className="report-card-table">
                <thead>
                  <tr><th rowSpan={2}>ASIGNATURA</th><th colSpan={3}>TRIMESTRES</th><th rowSpan={2}>SUPLETORIO</th><th rowSpan={2}>PROMEDIO ANUAL</th></tr>
                  <tr><th>I</th><th>II</th><th>III</th></tr>
                </thead>
                <tbody>
                  {annualResults.map((item) => (
                    <tr key={item.subject_id}>
                      <td>{item.subject_name.toUpperCase()}</td>
                      <td>{formatScore(item.term_1)}</td>
                      <td>{formatScore(item.term_2)}</td>
                      <td>{formatScore(item.term_3)}</td>
                      <td>{item.recovery_score == null ? '—' : formatScore(item.recovery_score)}</td>
                      <td>{formatScore(item.final_score)}</td>
                    </tr>
                  ))}
                  {!annualResults.length && <tr><td colSpan={6}>No existen resultados académicos.</td></tr>}
                  <tr className="report-card-total"><td colSpan={5}>PROMEDIO ANUAL</td><td>{formatScore(annualAverage)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section">
              <table className="report-card-table qualitative-table">
                <tbody>
                  {areas.map((area) => (
                    <tr key={area.id}>
                      <th>{area.name.toUpperCase()}</th>
                      {terms.map((term) => <td key={term.id}>{qualitativeByKey[`${term.id}:${area.id}`] || '—'}</td>)}
                    </tr>
                  ))}
                  {!areas.length && <tr><td>No existen áreas cualitativas configuradas.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section">
              <table className="report-card-table behavior-table">
                <tbody>
                  <tr>
                    <th>EVALUACIÓN COMPORTAMENTAL</th>
                    {terms.map((term) => <td key={term.id}><strong>{behaviorByTerm[term.id] || '—'}</strong><br />{behaviorDescription(term)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section report-card-attendance">
              <table className="report-card-table">
                <thead><tr><th>ASISTENCIA</th><th>JUSTIFICACIÓN</th><th>INJUSTIFICADO</th><th>TOTAL REGISTRADO</th></tr></thead>
                <tbody><tr><td>{annualAttendance.attended_days}</td><td>{annualAttendance.justified_absences}</td><td>{annualAttendance.unjustified_absences}</td><td>{annualAttendance.attended_days + annualAttendance.justified_absences + annualAttendance.unjustified_absences}</td></tr></tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="report-card-table-wrap">
              <table className="report-card-table">
                <thead><tr><th>ASIGNATURA</th><th>70 %</th><th>30 %</th><th>PROMEDIO</th><th>CUALITATIVA</th><th>APRENDIZAJE</th></tr></thead>
                <tbody>
                  {selectedTermRows.map((item) => <tr key={item.teacher_assignment_id}><td>{item.subject_name.toUpperCase()}</td><td>{formatScore(item.weighted_70)}</td><td>{formatScore(item.weighted_30)}</td><td>{formatScore(item.final_score)}</td><td>{item.alphabetic_scale || '—'}</td><td>{item.learning_scale || '—'}</td></tr>)}
                  {!selectedTermRows.length && <tr><td colSpan={6}>No existen resultados para este trimestre.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="report-card-two-columns report-card-section">
              <table className="report-card-table qualitative-table">
                <tbody>{areas.map((area) => <tr key={area.id}><th>{area.name.toUpperCase()}</th><td>{qualitativeByKey[`${termId}:${area.id}`] || '—'}</td></tr>)}</tbody>
              </table>
              <table className="report-card-table behavior-table">
                <tbody><tr><th>COMPORTAMIENTO</th><td><strong>{behaviorByTerm[termId] || '—'}</strong><br />{selectedTerm ? behaviorDescription(selectedTerm) : 'Sin registrar'}</td></tr></tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section report-card-attendance">
              <table className="report-card-table">
                <thead><tr><th>ASISTENCIA</th><th>JUSTIFICACIÓN</th><th>INJUSTIFICADO</th><th>TOTAL REGISTRADO</th></tr></thead>
                <tbody><tr><td>{attendanceByTerm[termId]?.attended_days ?? 0}</td><td>{attendanceByTerm[termId]?.justified_absences ?? 0}</td><td>{attendanceByTerm[termId]?.unjustified_absences ?? 0}</td><td>{Number(attendanceByTerm[termId]?.attended_days ?? 0) + Number(attendanceByTerm[termId]?.justified_absences ?? 0) + Number(attendanceByTerm[termId]?.unjustified_absences ?? 0)}</td></tr></tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <Modal open={editorOpen} title="Editar valoraciones complementarias" onClose={() => setEditorOpen(false)}>
        <div className="form-grid">
          <label className="field full-span"><span>Trimestre</span><select value={editorTermId} onChange={(event) => changeEditorTerm(event.target.value)}>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
          {areas.map((area) => (
            <label className="field" key={area.id}><span>{area.name}</span><select value={editorQualitative[area.id] || ''} onChange={(event) => setEditorQualitative((current) => ({ ...current, [area.id]: event.target.value as QualitativeLetter | '' }))}><option value="">Sin registrar</option>{qualitativeOptions.map((letter) => <option key={letter} value={letter}>{letter}</option>)}</select></label>
          ))}
          <label className="field full-span"><span>Comportamiento</span><select value={editorBehavior} onChange={(event) => setEditorBehavior(event.target.value as BehaviorLetter | '')}><option value="">Sin registrar</option>{behaviorCatalog.map((item) => <option key={item.letter} value={item.letter}>{item.letter} — {item.description}</option>)}</select></label>
          <div className="form-actions full-span"><button type="button" className="button button-light" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="button button-primary" disabled={saving} onClick={() => void saveComplementary().catch((error) => setNotice(errorMessage(error)))}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
        </div>
      </Modal>
    </>
  )
}
