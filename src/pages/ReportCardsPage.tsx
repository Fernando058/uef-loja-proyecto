import { Pencil, Printer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  AnnualSubjectResult,
  AttendanceSummary,
  BehaviorCatalogItem,
  BehaviorCode,
  BehaviorRecord,
  Course,
  Enrollment,
  InstitutionSettings,
  QualitativeLetter,
  QualitativeSubjectRecord,
  Subject,
  Term,
  TermSubjectResult,
} from '../types/domain'

type CardType = 'annual' | 'term'

const qualitativeOptions: QualitativeLetter[] = [
  'A+', 'A-', 'B+', 'B-', 'C+', 'C-', 'D+', 'D-', 'E+', 'E-',
]

const scoreText = (value: number | null | undefined) =>
  value == null ? '—' : Number(value).toFixed(2)

export function ReportCardsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'

  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [quantitativeSubjects, setQuantitativeSubjects] = useState<Subject[]>([])
  const [qualitativeSubjects, setQualitativeSubjects] = useState<Subject[]>([])
  const [behaviorCatalog, setBehaviorCatalog] = useState<BehaviorCatalogItem[]>([])
  const [institution, setInstitution] = useState<InstitutionSettings | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])

  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [termId, setTermId] = useState('')
  const [cardType, setCardType] = useState<CardType>('annual')

  const [annualResults, setAnnualResults] = useState<AnnualSubjectResult[]>([])
  const [termResults, setTermResults] = useState<TermSubjectResult[]>([])
  const [supplementary, setSupplementary] = useState<Record<string, number | null>>({})
  const [attendanceByTerm, setAttendanceByTerm] =
    useState<Record<string, AttendanceSummary>>({})
  const [behaviorByTerm, setBehaviorByTerm] =
    useState<Record<string, BehaviorRecord>>({})
  const [qualitativeByKey, setQualitativeByKey] =
    useState<Record<string, QualitativeLetter>>({})

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTermId, setEditorTermId] = useState('')
  const [editorBehavior, setEditorBehavior] = useState<BehaviorCode | ''>('')
  const [editorQualitative, setEditorQualitative] =
    useState<Record<string, QualitativeLetter | ''>>({})

  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBase = useCallback(async () => {
    const [yearRes, courseRes, subjectRes, behaviorRes, institutionRes] =
      await Promise.all([
        supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
        supabase.from('courses').select('*,grade_level:grade_levels(*)').eq('active', true),
        supabase.from('subjects').select('*').eq('active', true).order('sort_order'),
        supabase.from('behavior_catalog').select('*').eq('active', true).order('sort_order'),
        supabase.from('institution_settings').select('*').limit(1),
      ])

    const firstError = [yearRes, courseRes, subjectRes, behaviorRes, institutionRes]
      .find((item) => item.error)?.error
    if (firstError) throw firstError

    const yearRows = (yearRes.data ?? []) as AcademicYear[]
    const subjectRows = (subjectRes.data ?? []) as Subject[]

    setYears(yearRows)
    setCourses((courseRes.data ?? []) as Course[])
    setQuantitativeSubjects(subjectRows.filter((item) => item.kind === 'quantitative'))
    setQualitativeSubjects(subjectRows.filter((item) => item.kind === 'qualitative'))
    setBehaviorCatalog((behaviorRes.data ?? []) as BehaviorCatalogItem[])
    setInstitution(
      (((institutionRes.data ?? []) as InstitutionSettings[])[0] ?? null),
    )

    setYearId((current) =>
      current
      || yearRows.find((item) => item.active)?.id
      || yearRows[0]?.id
      || '',
    )
  }, [])

  useEffect(() => {
    void loadBase().catch((error) => setNotice(errorMessage(error)))
  }, [loadBase])

  const yearCourses = useMemo(
    () => courses
      .filter((course) => course.academic_year_id === yearId)
      .sort((a, b) =>
        (a.grade_level?.ordinal ?? 0) - (b.grade_level?.ordinal ?? 0)
        || a.parallel.localeCompare(b.parallel, 'es')
      ),
    [courses, yearId],
  )

  useEffect(() => {
    if (!yearId) return

    const loadYear = async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('academic_year_id', yearId)
        .order('number')

      if (error) throw error

      const rows = (data ?? []) as Term[]
      setTerms(rows)
      setTermId((current) =>
        rows.some((item) => item.id === current) ? current : rows[0]?.id || '',
      )
      setCourseId((current) =>
        yearCourses.some((item) => item.id === current)
          ? current
          : yearCourses[0]?.id || '',
      )
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
        .in('status', ['active', 'completed'])

      if (error) throw error

      const rows = ((data ?? []) as Enrollment[]).sort((a, b) =>
        fullName(a.student?.first_names, a.student?.last_names)
          .localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'),
      )

      setEnrollments(rows)
      setEnrollmentId((current) =>
        rows.some((item) => item.id === current)
          ? current
          : rows[0]?.id || '',
      )
    }

    void loadEnrollments().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, courseId])

  const loadCard = useCallback(async () => {
    if (!enrollmentId || !courseId) {
      setAnnualResults([])
      setTermResults([])
      setSupplementary({})
      setAttendanceByTerm({})
      setBehaviorByTerm({})
      setQualitativeByKey({})
      return
    }

    setNotice('')

    const [
      annualRes,
      supplementaryRes,
      attendanceRes,
      behaviorRes,
      qualitativeRes,
    ] = await Promise.all([
      supabase.rpc('get_subject_annual_results_v2', {
        p_enrollment_id: enrollmentId,
      }),
      supabase
        .from('supplementary_exams')
        .select('*')
        .eq('enrollment_id', enrollmentId),
      supabase
        .from('attendance_summaries')
        .select('*')
        .eq('enrollment_id', enrollmentId),
      supabase
        .from('behavior_records')
        .select('*')
        .eq('enrollment_id', enrollmentId),
      supabase
        .from('qualitative_subject_records')
        .select('*')
        .eq('enrollment_id', enrollmentId),
    ])

    const firstError = [
      annualRes,
      supplementaryRes,
      attendanceRes,
      behaviorRes,
      qualitativeRes,
    ].find((item) => item.error)?.error

    if (firstError) throw firstError

    let nextTermResults: TermSubjectResult[] = []
    if (termId) {
      const termRes = await supabase.rpc('get_subject_term_results_v2', {
        p_course_id: courseId,
        p_term_id: termId,
        p_subject_id: null,
        p_enrollment_id: enrollmentId,
      })
      if (termRes.error) throw termRes.error
      nextTermResults = (termRes.data ?? []) as TermSubjectResult[]
    }

    setAnnualResults((annualRes.data ?? []) as AnnualSubjectResult[])
    setTermResults(nextTermResults)

    setSupplementary(Object.fromEntries(
      ((supplementaryRes.data ?? []) as Array<{ subject_id: string; exam_score: number | null }>)
        .map((item) => [item.subject_id, item.exam_score]),
    ))

    setAttendanceByTerm(Object.fromEntries(
      ((attendanceRes.data ?? []) as AttendanceSummary[])
        .map((item) => [item.term_id, item]),
    ))

    setBehaviorByTerm(Object.fromEntries(
      ((behaviorRes.data ?? []) as BehaviorRecord[])
        .map((item) => [item.term_id, item]),
    ))

    setQualitativeByKey(Object.fromEntries(
      ((qualitativeRes.data ?? []) as QualitativeSubjectRecord[])
        .map((item) => [`${item.term_id}:${item.subject_id}`, item.letter]),
    ))
  }, [enrollmentId, courseId, termId])

  useEffect(() => {
    void loadCard().catch((error) => setNotice(errorMessage(error)))
  }, [loadCard])

  const selectedEnrollment = enrollments.find((item) => item.id === enrollmentId)
  const selectedStudent = selectedEnrollment?.student
  const selectedCourse = courses.find((item) => item.id === courseId)
  const selectedYear = years.find((item) => item.id === yearId)
  const selectedTerm = terms.find((item) => item.id === termId)

  const annualBySubject = useMemo(
    () => Object.fromEntries(annualResults.map((item) => [item.subject_id, item])),
    [annualResults],
  )

  const termBySubject = useMemo(
    () => Object.fromEntries(termResults.map((item) => [item.subject_id, item])),
    [termResults],
  )

  const annualAverage = useMemo(() => {
    const values = quantitativeSubjects
      .map((subject) => annualBySubject[subject.id]?.annual_score)
      .filter((value): value is number => value != null)
      .map(Number)

    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null
  }, [quantitativeSubjects, annualBySubject])

  const annualAttendance = useMemo(
    () => (Object.values(attendanceByTerm) as AttendanceSummary[]).reduce(
      (acc, item) => ({
        attended_days: acc.attended_days + Number(item.attended_days || 0),
        justified_absences:
          acc.justified_absences + Number(item.justified_absences || 0),
        unjustified_absences:
          acc.unjustified_absences + Number(item.unjustified_absences || 0),
      }),
      {
        attended_days: 0,
        justified_absences: 0,
        unjustified_absences: 0,
      },
    ),
    [attendanceByTerm],
  )

  const behaviorText = (targetTermId: string) => {
    const record = behaviorByTerm[targetTermId]
    if (!record) return 'Sin registrar'

    return behaviorCatalog.find((item) => item.code === record.behavior_code)
      ?.description ?? record.behavior_code
  }

  const openEditor = () => {
    const target = termId || terms[0]?.id || ''
    setEditorTermId(target)
    setEditorBehavior(behaviorByTerm[target]?.behavior_code ?? '')
    setEditorQualitative(Object.fromEntries(
      qualitativeSubjects.map((subject) => [
        subject.id,
        qualitativeByKey[`${target}:${subject.id}`] ?? '',
      ]),
    ))
    setEditorOpen(true)
  }

  const changeEditorTerm = (nextTermId: string) => {
    setEditorTermId(nextTermId)
    setEditorBehavior(behaviorByTerm[nextTermId]?.behavior_code ?? '')
    setEditorQualitative(Object.fromEntries(
      qualitativeSubjects.map((subject) => [
        subject.id,
        qualitativeByKey[`${nextTermId}:${subject.id}`] ?? '',
      ]),
    ))
  }

  const saveComplementary = async () => {
    if (!canEdit || !enrollmentId || !editorTermId) return

    setSaving(true)
    setNotice('')

    try {
      const { error: deleteQualitativeError } = await supabase
        .from('qualitative_subject_records')
        .delete()
        .eq('enrollment_id', enrollmentId)
        .eq('term_id', editorTermId)

      if (deleteQualitativeError) throw deleteQualitativeError

      const qualitativePayload = qualitativeSubjects.flatMap((subject) => {
        const letter = editorQualitative[subject.id]
        return letter
          ? [{
              enrollment_id: enrollmentId,
              term_id: editorTermId,
              subject_id: subject.id,
              letter,
              notes: null,
              updated_by: profile?.id ?? null,
            }]
          : []
      })

      if (qualitativePayload.length) {
        const { error } = await supabase
          .from('qualitative_subject_records')
          .insert(qualitativePayload)
        if (error) throw error
      }

      const { error: deleteBehaviorError } = await supabase
        .from('behavior_records')
        .delete()
        .eq('enrollment_id', enrollmentId)
        .eq('term_id', editorTermId)

      if (deleteBehaviorError) throw deleteBehaviorError

      if (editorBehavior) {
        const { error } = await supabase
          .from('behavior_records')
          .insert({
            enrollment_id: enrollmentId,
            term_id: editorTermId,
            behavior_code: editorBehavior,
            notes: null,
            updated_by: profile?.id ?? null,
          })
        if (error) throw error
      }

      setNotice('Valoraciones complementarias actualizadas.')
      setEditorOpen(false)
      await loadCard()
    } finally {
      setSaving(false)
    }
  }

  const weighted70 = (row: TermSubjectResult | undefined) =>
    row?.formative_average == null ? null : Number(row.formative_average) * 0.70

  const weighted30 = (row: TermSubjectResult | undefined) =>
    row?.summative_average == null ? null : Number(row.summative_average) * 0.30

  return (
    <>
      <PageHeader
        title="Boletas individuales"
        description="Genere, imprima o guarde como PDF la boleta trimestral y el consolidado anual."
        actions={(
          <button className="button button-light" onClick={() => window.print()}>
            <Printer size={17} /> Imprimir / PDF
          </button>
        )}
      />

      {notice && <div className="alert alert-info">{notice}</div>}

      <section className="panel filters-panel print-hide">
        <div className="filter-grid filter-grid-4">
          <label className="field">
            <span>Año lectivo</span>
            <select value={yearId} onChange={(event) => setYearId(event.target.value)}>
              {years.map((year) => (
                <option key={year.id} value={year.id}>{year.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Curso</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {yearCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.grade_level?.name ?? 'Grado'} “{course.parallel}”
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Estudiante</span>
            <select
              value={enrollmentId}
              onChange={(event) => setEnrollmentId(event.target.value)}
            >
              {enrollments.map((item) => (
                <option key={item.id} value={item.id}>
                  {fullName(item.student?.first_names, item.student?.last_names)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tipo de boleta</span>
            <select
              value={cardType}
              onChange={(event) => setCardType(event.target.value as CardType)}
            >
              <option value="annual">Anual</option>
              <option value="term">Trimestral</option>
            </select>
          </label>

          {cardType === 'term' && (
            <label className="field">
              <span>Trimestre</span>
              <select value={termId} onChange={(event) => setTermId(event.target.value)}>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>{term.name}</option>
                ))}
              </select>
            </label>
          )}

          {canEdit && (
            <div className="filter-action">
              <button
                className="button button-secondary"
                onClick={openEditor}
                disabled={!enrollmentId}
              >
                <Pencil size={17} /> Editar complementarios
              </button>
            </div>
          )}
        </div>
      </section>

      <article className="report-card-sheet">
        <header className="report-card-header">
          {institution?.logo_url && (
            <img
              className="report-card-logo"
              src={institution.logo_url}
              alt="Logotipo institucional"
            />
          )}
          <p>{institution?.institution_name ?? 'Unidad Educativa Fiscal Ejemplo'}</p>
          <h1>
            {cardType === 'annual'
              ? 'BOLETA ANUAL DE CALIFICACIONES'
              : 'BOLETA TRIMESTRAL DE CALIFICACIONES'}
          </h1>

          <div className="report-card-meta">
            <span>
              <strong>Estudiante:</strong>{' '}
              {fullName(selectedStudent?.first_names, selectedStudent?.last_names)}
            </span>
            <span>
              <strong>Identificación:</strong> {selectedStudent?.national_id || 'Pendiente'}
            </span>
            <span><strong>Año lectivo:</strong> {selectedYear?.name || '—'}</span>
            <span>
              <strong>Curso:</strong>{' '}
              {selectedCourse
                ? `${selectedCourse.grade_level?.name ?? 'Grado'} “${selectedCourse.parallel}”`
                : '—'}
            </span>
            {institution?.amie_code && (
              <span><strong>AMIE:</strong> {institution.amie_code}</span>
            )}
            {institution?.district && (
              <span><strong>Distrito:</strong> {institution.district}</span>
            )}
            {cardType === 'term' && (
              <span><strong>Periodo:</strong> {selectedTerm?.name || '—'}</span>
            )}
          </div>
        </header>

        {cardType === 'annual' ? (
          <>
            <div className="report-card-table-wrap">
              <table className="report-card-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>ASIGNATURA</th>
                    <th colSpan={3}>TRIMESTRES</th>
                    <th rowSpan={2}>SUPLETORIO</th>
                    <th rowSpan={2}>PROMEDIO ANUAL</th>
                  </tr>
                  <tr><th>I</th><th>II</th><th>III</th></tr>
                </thead>
                <tbody>
                  {quantitativeSubjects.map((subject) => {
                    const row = annualBySubject[subject.id]
                    return (
                      <tr key={subject.id}>
                        <td>{subject.name.toUpperCase()}</td>
                        <td>{scoreText(row?.term_1)}</td>
                        <td>{scoreText(row?.term_2)}</td>
                        <td>{scoreText(row?.term_3)}</td>
                        <td>{scoreText(supplementary[subject.id])}</td>
                        <td>{scoreText(row?.annual_score)}</td>
                      </tr>
                    )
                  })}

                  <tr className="report-card-total">
                    <td colSpan={5}>PROMEDIO ANUAL</td>
                    <td>{scoreText(annualAverage)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section">
              <table className="report-card-table qualitative-table">
                <thead>
                  <tr>
                    <th>ASIGNATURA CUALITATIVA</th>
                    {terms.map((term) => <th key={term.id}>{term.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {qualitativeSubjects.map((subject) => (
                    <tr key={subject.id}>
                      <td>{subject.name.toUpperCase()}</td>
                      {terms.map((term) => (
                        <td key={term.id}>
                          {qualitativeByKey[`${term.id}:${subject.id}`] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section">
              <table className="report-card-table behavior-table">
                <thead>
                  <tr>
                    <th>EVALUACIÓN COMPORTAMENTAL</th>
                    {terms.map((term) => <th key={term.id}>{term.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Comportamiento</td>
                    {terms.map((term) => (
                      <td key={term.id}>
                        <strong>{behaviorByTerm[term.id]?.behavior_code || '—'}</strong>
                        <br />
                        {behaviorText(term.id)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section report-card-attendance">
              <table className="report-card-table">
                <thead>
                  <tr>
                    <th>DÍAS ASISTIDOS</th>
                    <th>JUSTIFICADAS</th>
                    <th>INJUSTIFICADAS</th>
                    <th>TOTAL JORNADAS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{annualAttendance.attended_days}</td>
                    <td>{annualAttendance.justified_absences}</td>
                    <td>{annualAttendance.unjustified_absences}</td>
                    <td>
                      {annualAttendance.attended_days
                        + annualAttendance.justified_absences
                        + annualAttendance.unjustified_absences}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="report-card-table-wrap">
              {selectedCourse?.grade_level?.evaluation_model === 'weighted_70_30' ? (
                <table className="report-card-table">
                  <thead>
                    <tr>
                      <th>ASIGNATURA</th>
                      <th>PROM. FORM.</th>
                      <th>70 %</th>
                      <th>PROM. SUM.</th>
                      <th>30 %</th>
                      <th>PROMEDIO</th>
                      <th>CUALITATIVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantitativeSubjects.map((subject) => {
                      const row = termBySubject[subject.id]
                      return (
                        <tr key={subject.id}>
                          <td>{subject.name.toUpperCase()}</td>
                          <td>{scoreText(row?.formative_average)}</td>
                          <td>{scoreText(weighted70(row))}</td>
                          <td>{scoreText(row?.summative_average)}</td>
                          <td>{scoreText(weighted30(row))}</td>
                          <td>{scoreText(row?.term_score)}</td>
                          <td>{row?.qualitative || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="report-card-table">
                  <thead>
                    <tr>
                      <th>ASIGNATURA</th>
                      <th>PROMEDIO</th>
                      <th>CUALITATIVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantitativeSubjects.map((subject) => {
                      const row = termBySubject[subject.id]
                      return (
                        <tr key={subject.id}>
                          <td>{subject.name.toUpperCase()}</td>
                          <td>{scoreText(row?.term_score)}</td>
                          <td>{row?.qualitative || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="report-card-two-columns report-card-section">
              <table className="report-card-table qualitative-table">
                <tbody>
                  {qualitativeSubjects.map((subject) => (
                    <tr key={subject.id}>
                      <th>{subject.name.toUpperCase()}</th>
                      <td>{qualitativeByKey[`${termId}:${subject.id}`] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="report-card-table behavior-table">
                <tbody>
                  <tr>
                    <th>COMPORTAMIENTO</th>
                    <td>
                      <strong>{behaviorByTerm[termId]?.behavior_code || '—'}</strong>
                      <br />
                      {behaviorText(termId)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="report-card-table-wrap report-card-section report-card-attendance">
              <table className="report-card-table">
                <thead>
                  <tr>
                    <th>DÍAS ASISTIDOS</th>
                    <th>JUSTIFICADAS</th>
                    <th>INJUSTIFICADAS</th>
                    <th>TOTAL JORNADAS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{attendanceByTerm[termId]?.attended_days ?? 0}</td>
                    <td>{attendanceByTerm[termId]?.justified_absences ?? 0}</td>
                    <td>{attendanceByTerm[termId]?.unjustified_absences ?? 0}</td>
                    <td>
                      {Number(attendanceByTerm[termId]?.attended_days ?? 0)
                        + Number(attendanceByTerm[termId]?.justified_absences ?? 0)
                        + Number(attendanceByTerm[termId]?.unjustified_absences ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <Modal
        open={editorOpen}
        title="Editar valoraciones complementarias"
        onClose={() => setEditorOpen(false)}
      >
        <div className="form-grid">
          <label className="field full-span">
            <span>Trimestre</span>
            <select
              value={editorTermId}
              onChange={(event) => changeEditorTerm(event.target.value)}
            >
              {terms.map((term) => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>
          </label>

          {qualitativeSubjects.map((subject) => (
            <label className="field" key={subject.id}>
              <span>{subject.name}</span>
              <select
                value={editorQualitative[subject.id] || ''}
                onChange={(event) =>
                  setEditorQualitative((current) => ({
                    ...current,
                    [subject.id]:
                      event.target.value as QualitativeLetter | '',
                  }))
                }
              >
                <option value="">Sin registrar</option>
                {qualitativeOptions.map((letter) => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </label>
          ))}

          <label className="field full-span">
            <span>Comportamiento</span>
            <select
              value={editorBehavior}
              onChange={(event) =>
                setEditorBehavior(event.target.value as BehaviorCode | '')
              }
            >
              <option value="">Sin registrar</option>
              {behaviorCatalog.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.description}
                </option>
              ))}
            </select>
          </label>

          <div className="form-actions full-span">
            <button
              type="button"
              className="button button-light"
              onClick={() => setEditorOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={saving}
              onClick={() =>
                void saveComplementary().catch((error) =>
                  setNotice(errorMessage(error))
                )
              }
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
