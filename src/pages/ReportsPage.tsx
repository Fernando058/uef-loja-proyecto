import { BarChart3, Download, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { formatScore, fullName, scoreBand } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { AcademicYear, AnnualSubjectResult, Course, Enrollment, Term, TermSubjectResult } from '../types/domain'

type ReportTab = 'individual' | 'course'

const PIE_COLORS = ['#2e7d5b', '#d2a62a', '#b84b4b']

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('individual')
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [termId, setTermId] = useState('')
  const [enrollmentId, setEnrollmentId] = useState('')
  const [annualResults, setAnnualResults] = useState<AnnualSubjectResult[]>([])
  const [termResults, setTermResults] = useState<TermSubjectResult[]>([])
  const [courseResults, setCourseResults] = useState<TermSubjectResult[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [notice, setNotice] = useState('')
  const [behaviorByTerm, setBehaviorByTerm] = useState<Record<string, string>>({})

  const loadBase = useCallback(async () => {
    const [{ data: yearData, error }, { data: courseData }] = await Promise.all([
      supabase.from('academic_years').select('*').order('starts_on', { ascending: false }),
      supabase.from('courses').select('*').order('grade_level').order('parallel'),
    ])
    if (error) throw error
    const yearRows = (yearData ?? []) as AcademicYear[]
    setYears(yearRows)
    setCourses((courseData ?? []) as Course[])
    if (!yearId && yearRows[0]) setYearId(yearRows.find((item) => item.active)?.id ?? yearRows[0].id)
  }, [yearId])

  useEffect(() => {
    void loadBase().catch((error) => setNotice(errorMessage(error)))
  }, [loadBase])

  useEffect(() => {
    if (!yearId) return
    const loadYear = async () => {
      const { data, error } = await supabase.from('terms').select('*').eq('academic_year_id', yearId).order('order_no')
      if (error) throw error
      const rows = (data ?? []) as Term[]
      setTerms(rows)
      if (!rows.some((item) => item.id === termId)) setTermId(rows[0]?.id ?? '')
      const firstCourse = courses.find((course) => course.academic_year_id === yearId)
      if (!courses.some((course) => course.id === courseId && course.academic_year_id === yearId)) setCourseId(firstCourse?.id ?? '')
    }
    void loadYear().catch((error) => setNotice(errorMessage(error)))
  }, [yearId, courses, courseId, termId])

  useEffect(() => {
    if (!courseId || !yearId) return
    const loadEnrollments = async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*,student:students(*)')
        .eq('academic_year_id', yearId)
        .eq('course_id', courseId)
        .neq('status', 'transferred')
      if (error) throw error
      const rows = ((data ?? []) as Enrollment[]).sort((a, b) => fullName(a.student?.first_names, a.student?.last_names).localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'))
      setEnrollments(rows)
      if (!rows.some((item) => item.id === enrollmentId)) setEnrollmentId(rows[0]?.id ?? '')
    }
    void loadEnrollments().catch((error) => setNotice(errorMessage(error)))
  }, [courseId, yearId, enrollmentId])

  useEffect(() => {
    if (!enrollmentId) {
      setAnnualResults([])
      setTermResults([])
      return
    }
    const loadIndividual = async () => {
      const [annualRes, termRes, behaviorRes] = await Promise.all([
        supabase.from('v_annual_subject_results').select('*').eq('enrollment_id', enrollmentId).order('subject_name'),
        supabase.from('v_term_subject_results').select('*').eq('enrollment_id', enrollmentId).order('term_order').order('subject_name'),
        supabase.from('behavior_records').select('term_id,letter').eq('enrollment_id', enrollmentId),
      ])
      if (annualRes.error) throw annualRes.error
      if (termRes.error) throw termRes.error
      if (behaviorRes.error) throw behaviorRes.error
      setAnnualResults((annualRes.data ?? []) as AnnualSubjectResult[])
      setTermResults((termRes.data ?? []) as TermSubjectResult[])
      setBehaviorByTerm(Object.fromEntries(((behaviorRes.data ?? []) as Array<{ term_id: string; letter: string }>).map((item) => [item.term_id, item.letter])))
    }
    void loadIndividual().catch((error) => setNotice(errorMessage(error)))
  }, [enrollmentId, termId])

  useEffect(() => {
    if (!courseId || !termId) {
      setCourseResults([])
      return
    }
    const loadCourse = async () => {
      const { data, error } = await supabase.from('v_term_subject_results').select('*').eq('course_id', courseId).eq('term_id', termId)
      if (error) throw error
      const rows = (data ?? []) as TermSubjectResult[]
      setCourseResults(rows)
      const subjects = [...new Set(rows.map((item) => item.subject_id))]
      if (!subjects.includes(selectedSubject)) setSelectedSubject(subjects[0] ?? '')
    }
    void loadCourse().catch((error) => setNotice(errorMessage(error)))
  }, [courseId, termId, selectedSubject])

  const student = enrollments.find((item) => item.id === enrollmentId)?.student
  const yearCourses = courses.filter((course) => course.academic_year_id === yearId)

  const individualBarData = annualResults.map((item) => ({
    subject: item.subject_name,
    score: item.final_score,
  }))

  const individualTrendData = terms.map((term) => {
    const values = termResults.filter((item) => item.term_id === term.id && item.final_score !== null).map((item) => Number(item.final_score))
    return {
      term: term.name.replace('Trimestre ', 'T'),
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    }
  })

  const subjectGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; values: number[] }>()
    for (const row of courseResults) {
      if (!map.has(row.subject_id)) map.set(row.subject_id, { id: row.subject_id, name: row.subject_name, values: [] })
      if (row.final_score !== null) map.get(row.subject_id)?.values.push(Number(row.final_score))
    }
    return [...map.values()]
  }, [courseResults])

  const courseBarData = subjectGroups.map((group) => ({
    subject: group.name,
    average: group.values.length ? group.values.reduce((sum, value) => sum + value, 0) / group.values.length : 0,
  }))

  const selectedRows = courseResults.filter((item) => item.subject_id === selectedSubject && item.final_score !== null)
  const pieCounts = selectedRows.reduce(
    (acc, item) => {
      const band = scoreBand(Number(item.final_score))
      acc[band] = (acc[band] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const pieData = ['Excelente', 'Bueno', 'Necesita refuerzo'].map((name) => ({ name, value: pieCounts[name] ?? 0 }))
  const selectedSubjectName = selectedRows[0]?.subject_name ?? subjectGroups.find((item) => item.id === selectedSubject)?.name

  const pivotSubjects = subjectGroups.map((item) => item.name)
  const pivotStudents = useMemo(() => {
    const grouped = new Map<string, { name: string; scores: Record<string, number | null> }>()
    for (const row of courseResults) {
      const item = grouped.get(row.enrollment_id) ?? { name: row.student_name, scores: {} }
      item.scores[row.subject_name] = row.final_score
      grouped.set(row.enrollment_id, item)
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [courseResults])

  const printReport = () => window.print()

  return (
    <>
      <PageHeader
        title="Reportes y analítica"
        description="Genere resultados trimestrales y anuales, identifique tendencias y estudiantes que necesitan refuerzo."
        actions={<button className="button button-light" onClick={printReport}><Download size={17} /> Imprimir / PDF</button>}
      />
      {notice && <div className="alert alert-info">{notice}</div>}

      <div className="tabs print-hide">
        <button className={tab === 'individual' ? 'tab active' : 'tab'} onClick={() => setTab('individual')}><UserRound size={17} /> Reporte por alumno</button>
        <button className={tab === 'course' ? 'tab active' : 'tab'} onClick={() => setTab('course')}><BarChart3 size={17} /> Reporte global por curso</button>
      </div>

      <section className="panel filters-panel print-hide">
        <div className="filter-grid filter-grid-4">
          <label className="field"><span>Año lectivo</span><select value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label className="field"><span>Curso</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{yearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level} “{course.parallel}”</option>)}</select></label>
          {tab === 'individual' && (
            <label className="field"><span>Estudiante</span><select value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>{enrollments.map((item) => <option key={item.id} value={item.id}>{fullName(item.student?.first_names, item.student?.last_names)}</option>)}</select></label>
          )}
          <label className="field"><span>Trimestre</span><select value={termId} onChange={(event) => setTermId(event.target.value)}>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
        </div>
      </section>

      {tab === 'individual' && (
        <div className="report-stack">
          <section className="report-title-block">
            <p>Unidad Educativa Fiscal Loja</p>
            <h2>Resumen académico individual</h2>
            <div className="report-meta"><span><strong>Estudiante:</strong> {fullName(student?.first_names, student?.last_names)}</span><span><strong>Año lectivo:</strong> {years.find((item) => item.id === yearId)?.name}</span><span><strong>Curso:</strong> {courses.find((item) => item.id === courseId)?.grade_level} “{courses.find((item) => item.id === courseId)?.parallel}”</span><span><strong>Comportamiento:</strong> {terms.map((term) => `${term.name.replace('Trimestre ', 'T')}: ${behaviorByTerm[term.id] || '—'}`).join(' · ')}</span></div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Reporte trimestral por alumno</h2><p>{terms.find((item) => item.id === termId)?.name || 'Trimestre'} · Comportamiento: <strong>{behaviorByTerm[termId] || 'Sin registrar'}</strong></p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Materia</th><th>70 %</th><th>30 %</th><th>Promedio trimestral</th><th>Cualitativa</th><th>Aprendizaje</th><th>Estado</th></tr></thead><tbody>
              {termResults.filter((item) => item.term_id === termId).map((item) => <tr key={item.teacher_assignment_id}><td><strong>{item.subject_name}</strong></td><td>{formatScore(item.weighted_70)}</td><td>{formatScore(item.weighted_30)}</td><td><strong>{formatScore(item.final_score)}</strong></td><td>{item.alphabetic_scale || '—'}</td><td>{item.learning_scale || '—'}</td><td>{item.result_status === 'complete' ? 'Completo' : item.result_status === 'provisional' ? 'Provisional' : 'Incompleto'}</td></tr>)}
              {!termResults.filter((item) => item.term_id === termId).length && <tr><td colSpan={7} className="empty-cell">No existen resultados para este trimestre.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="charts-grid">
            <article className="panel chart-panel">
              <div className="panel-heading"><div><h2>Rendimiento por materia</h2><p>Nota final anual en escala de 0 a 10.</p></div></div>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={individualBarData} margin={{ top: 10, right: 10, left: -15, bottom: 55 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="subject" angle={-30} textAnchor="end" interval={0} height={70} />
                    <YAxis domain={[0, 10]} />
                    <Tooltip formatter={(value) => Number(value).toFixed(2)} />
                    <Bar dataKey="score" name="Nota final" fill="#2c6e8f" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel chart-panel">
              <div className="panel-heading"><div><h2>Tendencia trimestral</h2><p>Promedio general del estudiante por trimestre.</p></div></div>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={individualTrendData} margin={{ top: 10, right: 20, left: -15, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="term" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip formatter={(value) => Number(value).toFixed(2)} />
                    <Line type="monotone" dataKey="average" name="Promedio" stroke="#2e7d5b" strokeWidth={3} dot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Resumen anual por materia</h2><p>Los trimestres vacíos no se toman como cero.</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Materia</th><th>T1</th><th>T2</th><th>T3</th><th>Promedio anual</th><th>Recuperación</th><th>Nota final</th><th>Cualitativa</th><th>Aprendizaje</th></tr></thead><tbody>
              {annualResults.map((item) => <tr key={item.subject_id}><td><strong>{item.subject_name}</strong></td><td>{formatScore(item.term_1)}</td><td>{formatScore(item.term_2)}</td><td>{formatScore(item.term_3)}</td><td>{formatScore(item.annual_average)}</td><td>{formatScore(item.recovery_score)}</td><td><strong>{formatScore(item.final_score)}</strong></td><td>{item.alphabetic_scale || '—'}</td><td>{item.learning_scale || '—'}</td></tr>)}
              {!annualResults.length && <tr><td colSpan={9} className="empty-cell">No existen resultados para este estudiante.</td></tr>}
            </tbody></table></div>
          </section>
        </div>
      )}

      {tab === 'course' && (
        <div className="report-stack">
          <section className="charts-grid">
            <article className="panel chart-panel">
              <div className="panel-heading"><div><h2>Promedio global por materia</h2><p>Comparación de rendimiento del curso.</p></div></div>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={courseBarData} margin={{ top: 10, right: 10, left: -15, bottom: 55 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="subject" angle={-30} textAnchor="end" interval={0} height={70} />
                    <YAxis domain={[0, 10]} />
                    <Tooltip formatter={(value) => Number(value).toFixed(2)} />
                    <Bar dataKey="average" name="Promedio" fill="#2c6e8f" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel chart-panel">
              <div className="panel-heading">
                <div><h2>Distribución de {selectedSubjectName || 'la materia'}</h2><p>Excelente, bueno y necesita refuerzo.</p></div>
                <select className="compact-select print-hide" value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{subjectGroups.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
              </div>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {pieData.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Listado de estudiantes por curso</h2><p>Nota trimestral de cada materia.</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Estudiante</th>{pivotSubjects.map((subject) => <th key={subject}>{subject}</th>)}</tr></thead><tbody>
              {pivotStudents.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td>{pivotSubjects.map((subject) => <td key={subject} className={typeof item.scores[subject] === 'number' && item.scores[subject]! < 6.5 ? 'cell-alert' : ''}>{formatScore(item.scores[subject])}</td>)}</tr>)}
              {!pivotStudents.length && <tr><td colSpan={pivotSubjects.length + 1} className="empty-cell">No existen resultados para este curso y trimestre.</td></tr>}
            </tbody></table></div>
          </section>
        </div>
      )}
    </>
  )
}
