import { BarChart3, Download, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName, scoreBand } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  AnnualSubjectResult,
  Course,
  Enrollment,
  Subject,
  Term,
  TermSubjectResult,
} from '../types/domain'

type Tab = 'individual' | 'course'

const PIE_META = [
  { name: 'Excelente', color: '#2e7d5b', description: 'A+ y A- desde 8,50' },
  { name: 'Bueno', color: '#d2a62a', description: 'B+ y B- de 6,50 a 8,49' },
  { name: 'Necesita refuerzo', color: '#b84b4b', description: 'C+ o inferior: menor a 6,50' },
]

const BAR_COLORS = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#4f46e5',
  '#65a30d',
]

const pieLabel = ({ name, value }: { name?: string; value?: number }) =>
  value ? `${name}: ${value}` : ''

const bandClass = (band: string) => {
  if (band === 'Excelente') return 'analytics-excellent'
  if (band === 'Bueno') return 'analytics-good'
  if (band === 'Necesita refuerzo') return 'analytics-reinforcement'
  return 'analytics-empty'
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('individual')
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [termId, setTermId] = useState('')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [termResults, setTermResults] = useState<TermSubjectResult[]>([])
  const [annualResults, setAnnualResults] = useState<AnnualSubjectResult[]>([])
  const [notice, setNotice] = useState('')

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

  useEffect(() => {
    void loadBase().catch((error) => setNotice(errorMessage(error)))
  }, [loadBase])

  useEffect(() => {
    if (!yearId) return
    const run = async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('academic_year_id', yearId)
        .order('number')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      if (!rows.some((item) => item.id === termId)) setTermId(rows[0]?.id ?? '')
      const yearCourses = courses.filter((item) => item.academic_year_id === yearId)
      if (!yearCourses.some((item) => item.id === courseId)) setCourseId(yearCourses[0]?.id ?? '')
    }
    void run().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, courses, courseId, termId])

  useEffect(() => {
    if (!yearId || !courseId) return
    const run = async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*,student:students(*)')
        .eq('academic_year_id', yearId)
        .eq('course_id', courseId)
        .in('status', ['active', 'completed'])
      if (error) throw error
      const rows = ((data ?? []) as Enrollment[]).sort((a, b) =>
        fullName(a.student?.first_names, a.student?.last_names).localeCompare(
          fullName(b.student?.first_names, b.student?.last_names),
          'es',
        ),
      )
      setEnrollments(rows)
      if (!rows.some((item) => item.id === enrollmentId)) setEnrollmentId(rows[0]?.id ?? '')
    }
    void run().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, courseId, enrollmentId])

  useEffect(() => {
    if (!courseId || !termId) {
      setTermResults([])
      return
    }
    const run = async () => {
      const { data, error } = await supabase.rpc('get_subject_term_results_v2', {
        p_course_id: courseId,
        p_term_id: termId,
        p_subject_id: null,
        p_enrollment_id: null,
      })
      if (error) throw error
      setTermResults((data ?? []) as TermSubjectResult[])
      setNotice('')
    }
    void run().catch((error) => setNotice(errorMessage(error)))
  }, [courseId, termId])

  useEffect(() => {
    if (!enrollmentId) {
      setAnnualResults([])
      return
    }
    const run = async () => {
      const { data, error } = await supabase.rpc('get_subject_annual_results_v2', {
        p_enrollment_id: enrollmentId,
      })
      if (error) throw error
      setAnnualResults((data ?? []) as AnnualSubjectResult[])
      setNotice('')
    }
    void run().catch((error) => setNotice(errorMessage(error)))
  }, [enrollmentId])

  const yearCourses = courses.filter((item) => item.academic_year_id === yearId)
  const selectedStudent = enrollments.find((item) => item.id === enrollmentId)?.student
  const subjectName = (id: string) => subjects.find((item) => item.id === id)?.name ?? 'Asignatura'
  const subjectAbbreviation = (id: string) =>
    subjects.find((item) => item.id === id)?.abbreviation ?? 'ASIG'

  const subjectGuide = useMemo(
    () =>
      subjects.map((subject, index) => ({
        id: subject.id,
        abbreviation: subject.abbreviation,
        name: subject.name,
        color: BAR_COLORS[index % BAR_COLORS.length],
      })),
    [subjects],
  )

  useEffect(() => {
    if (!subjects.length) {
      setSelectedSubjectId('')
      return
    }

    if (!subjects.some((subject) => subject.id === selectedSubjectId)) {
      setSelectedSubjectId(subjects[0].id)
    }
  }, [subjects, selectedSubjectId])

  const individualData = annualResults
    .filter((item) => item.annual_score != null)
    .map((item) => ({
      subject: subjectName(item.subject_id),
      shortLabel: subjectAbbreviation(item.subject_id),
      score: Number(item.annual_score),
      color:
        subjectGuide.find((guide) => guide.id === item.subject_id)?.color
        ?? BAR_COLORS[0],
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'es'))

  const courseSubjectGroups = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const row of termResults) {
      if (row.term_score == null) continue
      const values = map.get(row.subject_id) ?? []
      values.push(Number(row.term_score))
      map.set(row.subject_id, values)
    }

    return [...map.entries()]
      .map(([subjectId, values]) => ({
        subjectId,
        subject: subjectName(subjectId),
        shortLabel: subjectAbbreviation(subjectId),
        average: values.reduce((a, b) => a + b, 0) / values.length,
        values,
        color:
          subjectGuide.find((guide) => guide.id === subjectId)?.color
          ?? BAR_COLORS[0],
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'es'))
  }, [termResults, subjects, subjectGuide])

  const allCourseScores = termResults.filter((item) => item.term_score != null)

  // Distribución global: cada resultado alumno-asignatura cuenta una vez.
  const globalBandCounts = allCourseScores.reduce((acc, row) => {
    const band = scoreBand(Number(row.term_score))
    acc[band] = (acc[band] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const globalPieData = PIE_META
    .map((item) => ({
      ...item,
      value: globalBandCounts[item.name] ?? 0,
    }))
    .filter((item) => item.value > 0)

  const totalGlobalResults = globalPieData.reduce((sum, item) => sum + item.value, 0)

  // Distribución por materia: máximo un resultado por estudiante.
  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId)
  const selectedSubjectResults = termResults.filter(
    (item) => item.subject_id === selectedSubjectId && item.term_score != null,
  )

  const subjectBandCounts = selectedSubjectResults.reduce((acc, row) => {
    const band = scoreBand(Number(row.term_score))
    acc[band] = (acc[band] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const subjectPieData = PIE_META
    .map((item) => ({
      ...item,
      value: subjectBandCounts[item.name] ?? 0,
    }))
    .filter((item) => item.value > 0)

  const totalSubjectStudents = subjectPieData.reduce((sum, item) => sum + item.value, 0)

  const tableRows = useMemo(
    () =>
      enrollments.map((enrollment) => {
        const scores = Object.fromEntries(
          termResults
            .filter((row) => row.enrollment_id === enrollment.id)
            .map((row) => [row.subject_id, row.term_score]),
        ) as Record<string, number | null>

        const validScores = subjects
          .map((subject) => scores[subject.id])
          .filter((value): value is number => value != null)
          .map(Number)

        const average = validScores.length
          ? validScores.reduce((sum, value) => sum + value, 0) / validScores.length
          : null

        return {
          enrollment,
          scores,
          average,
          band: scoreBand(average),
        }
      }),
    [enrollments, termResults, subjects],
  )

  return (
    <>
      <PageHeader
        title="Analítica académica V2"
        description="Consulte resultados calculados por el motor normativo sin editar los promedios."
        actions={
          <button className="button button-light" onClick={() => window.print()}>
            <Download size={17} /> Imprimir / PDF
          </button>
        }
      />

      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="tabs print-hide">
        <button
          className={tab === 'individual' ? 'tab active' : 'tab'}
          onClick={() => setTab('individual')}
        >
          <UserRound size={17} /> Por estudiante
        </button>
        <button
          className={tab === 'course' ? 'tab active' : 'tab'}
          onClick={() => setTab('course')}
        >
          <BarChart3 size={17} /> Por curso
        </button>
      </div>

      <section className="panel filters-panel print-hide">
        <div className="filter-grid filter-grid-4">
          <label className="field">
            <span>Año</span>
            <select value={yearId} onChange={(event) => setYearId(event.target.value)}>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Curso</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {yearCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.grade_level?.name} “{course.parallel}”
                </option>
              ))}
            </select>
          </label>

          {tab === 'individual' ? (
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
          ) : (
            <label className="field">
              <span>Trimestre</span>
              <select value={termId} onChange={(event) => setTermId(event.target.value)}>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {tab === 'individual' ? (
        <div className="report-stack">
          <div className="report-title-block">
            <p>Resumen anual por estudiante</p>
            <h2>
              {selectedStudent
                ? fullName(selectedStudent.first_names, selectedStudent.last_names)
                : 'Seleccione un estudiante'}
            </h2>
          </div>

          <section className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asignatura</th>
                    <th>T1</th>
                    <th>T2</th>
                    <th>T3</th>
                    <th>Promedio anual</th>
                    <th>Cualitativa</th>
                  </tr>
                </thead>
                <tbody>
                  {annualResults.map((row) => (
                    <tr key={row.subject_id}>
                      <td>
                        <strong>{subjectName(row.subject_id)}</strong>
                      </td>
                      <td>{formatScore(row.term_1)}</td>
                      <td>{formatScore(row.term_2)}</td>
                      <td>{formatScore(row.term_3)}</td>
                      <td>{formatScore(row.annual_score)}</td>
                      <td>
                        <span className="badge badge-primary">{row.qualitative ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                  {!annualResults.length && (
                    <tr>
                      <td colSpan={6} className="empty-cell">
                        Todavía no existen resultados anuales completos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <h2>Rendimiento anual por asignatura</h2>
                <p>Las barras muestran el promedio anual del estudiante.</p>
              </div>
            </div>
            <div className="chart-box chart-box-tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={individualData} margin={{ top: 10, right: 12, left: 0, bottom: 24 }}>
                  <CartesianGrid stroke="#d9e2ec" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="shortLabel"
                    interval={0}
                    tick={{ fontSize: 11, fill: '#475569' }}
                  />
                  <YAxis domain={[0, 10]} stroke="#64748b" />
                  <Tooltip
                    formatter={(value) => [Number(value ?? 0).toFixed(2), 'Promedio anual']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.subject ?? 'Asignatura'}
                  />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                    {individualData.map((entry, index) => (
                      <Cell key={entry.shortLabel + index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="subject-guide">
              {subjectGuide.map((item) => (
                <div key={item.id} className="subject-guide-item">
                  <span
                    className="subject-guide-dot"
                    style={{ backgroundColor: item.color }}
                  />
                  <strong>{item.abbreviation}</strong>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="report-stack">
          <section className="charts-grid">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Promedio por asignatura</h2>
                  <p>Cada barra usa un color distinto para identificar la materia.</p>
                </div>
              </div>

              <div className="chart-box chart-box-tall">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={courseSubjectGroups}
                    margin={{ top: 10, right: 12, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid stroke="#d9e2ec" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="shortLabel"
                      interval={0}
                      tick={{ fontSize: 11, fill: '#475569' }}
                    />
                    <YAxis domain={[0, 10]} stroke="#64748b" />
                    <Tooltip
                      formatter={(value) => [Number(value ?? 0).toFixed(2), 'Promedio del curso']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.subject ?? 'Asignatura'}
                    />
                    <Bar dataKey="average" radius={[6, 6, 0, 0]}>
                      {courseSubjectGroups.map((entry, index) => (
                        <Cell key={entry.subjectId + index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="subject-guide">
                {courseSubjectGroups.map((item) => (
                  <div key={item.subjectId} className="subject-guide-item">
                    <span
                      className="subject-guide-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    <strong>{item.shortLabel}</strong>
                    <span>{item.subject}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Distribución global de resultados</h2>
                  <p>
                    {enrollments.length} estudiantes × {subjects.length} asignaturas =
                    {' '}{totalGlobalResults} resultados evaluados.
                  </p>
                </div>
              </div>

              <div className="chart-box chart-box-tall">
                {allCourseScores.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={globalPieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={100}
                        label={pieLabel}
                        labelLine
                      >
                        {globalPieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, props) => {
                          const numericValue = Number(value ?? 0)
                          const percent = totalGlobalResults
                            ? ((numericValue / totalGlobalResults) * 100).toFixed(1)
                            : '0.0'
                          const label =
                            props?.payload && typeof props.payload === 'object' && 'name' in props.payload
                              ? String(props.payload.name)
                              : 'Categoría'
                          return [`${numericValue} registros (${percent} %)`, label]
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">Sin resultados calculados para este trimestre.</div>
                )}
              </div>

              <div className="performance-summary">
                {PIE_META.map((item) => {
                  const count = globalBandCounts[item.name] ?? 0
                  const percent = totalGlobalResults
                    ? Math.round((count / totalGlobalResults) * 100)
                    : 0
                  return (
                    <div key={item.name} className="performance-summary-item">
                      <span
                        className="performance-summary-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="performance-summary-text">
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </div>
                      <div className="performance-summary-stats">
                        <strong>{count} resultados</strong>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          </section>

          <section className="panel subject-performance-panel">
            <div className="panel-heading subject-performance-heading">
              <div>
                <h2>Desempeño por asignatura</h2>
                <p>
                  Aquí cada estudiante cuenta una sola vez. El total no puede superar
                  los {enrollments.length} estudiantes del curso.
                </p>
              </div>

              <label className="field subject-performance-selector print-hide">
                <span>Asignatura</span>
                <select
                  value={selectedSubjectId}
                  onChange={(event) => setSelectedSubjectId(event.target.value)}
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.abbreviation} — {subject.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="subject-performance-grid">
              <div className="chart-box chart-box-tall">
                {totalSubjectStudents ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subjectPieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={105}
                        label={pieLabel}
                        labelLine
                      >
                        {subjectPieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, props) => {
                          const numericValue = Number(value ?? 0)
                          const percent = totalSubjectStudents
                            ? ((numericValue / totalSubjectStudents) * 100).toFixed(1)
                            : '0.0'
                          const label =
                            props?.payload
                            && typeof props.payload === 'object'
                            && 'name' in props.payload
                              ? String(props.payload.name)
                              : 'Categoría'
                          return [`${numericValue} estudiantes (${percent} %)`, label]
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">
                    Sin resultados para {selectedSubject?.name ?? 'esta asignatura'}.
                  </div>
                )}
              </div>

              <div className="subject-performance-summary">
                <div className="subject-performance-title">
                  <span>Asignatura seleccionada</span>
                  <strong>{selectedSubject?.name ?? '—'}</strong>
                  <small>{totalSubjectStudents} estudiantes evaluados</small>
                </div>

                {PIE_META.map((item) => {
                  const count = subjectBandCounts[item.name] ?? 0
                  const percent = totalSubjectStudents
                    ? Math.round((count / totalSubjectStudents) * 100)
                    : 0

                  return (
                    <div key={item.name} className="performance-summary-item">
                      <span
                        className="performance-summary-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="performance-summary-text">
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </div>
                      <div className="performance-summary-stats">
                        <strong>{count} estudiantes</strong>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  )
                })}

                <div className="reinforcement-callout">
                  <strong>
                    {subjectBandCounts['Necesita refuerzo'] ?? 0} estudiante(s)
                    necesitan refuerzo
                  </strong>
                  <span>
                    en {selectedSubject?.name ?? 'la asignatura seleccionada'}.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel analytics-student-panel">
            <div className="panel-heading">
              <div>
                <h2>Detalle por estudiante</h2>
                <p>
                  El color de cada nota identifica su nivel; el promedio clasifica
                  el desempeño global del estudiante en el trimestre.
                </p>
              </div>
            </div>
            <div className="analytics-color-legend">
              {PIE_META.map((item) => (
                <span key={item.name}>
                  <i style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    {subjects.map((subject) => (
                      <th key={subject.id}>{subject.abbreviation}</th>
                    ))}
                    <th>Promedio</th>
                    <th>Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(({ enrollment, scores, average, band }) => (
                    <tr key={enrollment.id} className={`analytics-student-row ${bandClass(band)}`}>
                      <td className="analytics-student-name">
                        <strong>
                          {fullName(enrollment.student?.first_names, enrollment.student?.last_names)}
                        </strong>
                      </td>

                      {subjects.map((subject) => {
                        const score = scores[subject.id]
                        const cellBand = score == null ? 'Sin datos' : scoreBand(Number(score))

                        return (
                          <td key={subject.id} className="analytics-score-cell">
                            <span className={`analytics-score-pill ${bandClass(cellBand)}`}>
                              {formatScore(score)}
                            </span>
                          </td>
                        )
                      })}

                      <td className="analytics-average-cell">
                        <strong>{formatScore(average)}</strong>
                      </td>
                      <td>
                        <span className={`analytics-band-badge ${bandClass(band)}`}>
                          {band}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!tableRows.length && (
                    <tr>
                      <td colSpan={subjects.length + 3} className="empty-cell">
                        No existen resultados en este curso.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
