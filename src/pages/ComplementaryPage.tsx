import { Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  BehaviorCatalogItem,
  BehaviorCode,
  BehaviorRecord,
  Course,
  Enrollment,
  QualitativeLetter,
  QualitativeSubjectRecord,
  Subject,
  Term,
} from '../types/domain'

const qualitativeOptions: QualitativeLetter[] = [
  'A+', 'A-', 'B+', 'B-', 'C+', 'C-', 'D+', 'D-', 'E+', 'E-',
]

interface DraftRow {
  qualitative: Record<string, QualitativeLetter | ''>
  behavior: BehaviorCode | ''
}

export function ComplementaryPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'

  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [behaviorCatalog, setBehaviorCatalog] = useState<BehaviorCatalogItem[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})

  const [yearId, setYearId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [termId, setTermId] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBase = useCallback(async () => {
    const [yearRes, courseRes, subjectRes, behaviorRes] = await Promise.all([
      supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
      supabase.from('courses').select('*,grade_level:grade_levels(*)').eq('active', true),
      supabase.from('subjects').select('*').eq('active', true).eq('kind', 'qualitative').order('sort_order'),
      supabase.from('behavior_catalog').select('*').eq('active', true).order('sort_order'),
    ])

    const firstError = [yearRes, courseRes, subjectRes, behaviorRes]
      .find((item) => item.error)?.error
    if (firstError) throw firstError

    const yearRows = (yearRes.data ?? []) as AcademicYear[]
    setYears(yearRows)
    setCourses((courseRes.data ?? []) as Course[])
    setSubjects((subjectRes.data ?? []) as Subject[])
    setBehaviorCatalog((behaviorRes.data ?? []) as BehaviorCatalogItem[])
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

  const loadRows = useCallback(async () => {
    if (!yearId || !courseId || !termId) {
      setEnrollments([])
      setDrafts({})
      return
    }

    setNotice('')

    const enrollmentRes = await supabase
      .from('enrollments')
      .select('*,student:students(*)')
      .eq('academic_year_id', yearId)
      .eq('course_id', courseId)
      .in('status', ['active', 'completed'])

    if (enrollmentRes.error) throw enrollmentRes.error

    const enrollmentRows = ((enrollmentRes.data ?? []) as Enrollment[]).sort((a, b) =>
      fullName(a.student?.first_names, a.student?.last_names)
        .localeCompare(fullName(b.student?.first_names, b.student?.last_names), 'es'),
    )
    setEnrollments(enrollmentRows)

    const ids = enrollmentRows.map((item) => item.id)
    if (!ids.length) {
      setDrafts({})
      return
    }

    const [qualitativeRes, behaviorRes] = await Promise.all([
      supabase
        .from('qualitative_subject_records')
        .select('*')
        .eq('term_id', termId)
        .in('enrollment_id', ids),
      supabase
        .from('behavior_records')
        .select('*')
        .eq('term_id', termId)
        .in('enrollment_id', ids),
    ])

    const firstError = [qualitativeRes, behaviorRes].find((item) => item.error)?.error
    if (firstError) throw firstError

    const qualitativeRows =
      (qualitativeRes.data ?? []) as QualitativeSubjectRecord[]
    const behaviorRows = (behaviorRes.data ?? []) as BehaviorRecord[]

    const next: Record<string, DraftRow> = {}
    for (const enrollment of enrollmentRows) {
      next[enrollment.id] = {
        qualitative: Object.fromEntries(
          subjects.map((subject) => [
            subject.id,
            qualitativeRows.find(
              (row) =>
                row.enrollment_id === enrollment.id
                && row.subject_id === subject.id,
            )?.letter ?? '',
          ]),
        ),
        behavior:
          behaviorRows.find((row) => row.enrollment_id === enrollment.id)
            ?.behavior_code ?? '',
      }
    }

    setDrafts(next)
  }, [yearId, courseId, termId, subjects])

  useEffect(() => {
    void loadRows().catch((error) => setNotice(errorMessage(error)))
  }, [loadRows])

  const updateQualitative = (
    enrollmentId: string,
    subjectId: string,
    value: QualitativeLetter | '',
  ) => {
    setDrafts((current) => ({
      ...current,
      [enrollmentId]: {
        ...(current[enrollmentId] ?? { qualitative: {}, behavior: '' }),
        qualitative: {
          ...(current[enrollmentId]?.qualitative ?? {}),
          [subjectId]: value,
        },
      },
    }))
  }

  const updateBehavior = (enrollmentId: string, value: BehaviorCode | '') => {
    setDrafts((current) => ({
      ...current,
      [enrollmentId]: {
        ...(current[enrollmentId] ?? { qualitative: {}, behavior: '' }),
        behavior: value,
      },
    }))
  }

  const saveAll = async () => {
    if (!canEdit || !termId || !enrollments.length) return

    setSaving(true)
    setNotice('')

    try {
      const ids = enrollments.map((item) => item.id)

      const [deleteQualitative, deleteBehavior] = await Promise.all([
        supabase
          .from('qualitative_subject_records')
          .delete()
          .eq('term_id', termId)
          .in('enrollment_id', ids),
        supabase
          .from('behavior_records')
          .delete()
          .eq('term_id', termId)
          .in('enrollment_id', ids),
      ])

      if (deleteQualitative.error) throw deleteQualitative.error
      if (deleteBehavior.error) throw deleteBehavior.error

      const qualitativePayload = enrollments.flatMap((enrollment) =>
        subjects.flatMap((subject) => {
          const letter = drafts[enrollment.id]?.qualitative?.[subject.id]
          return letter
            ? [{
                enrollment_id: enrollment.id,
                term_id: termId,
                subject_id: subject.id,
                letter,
                notes: null,
                updated_by: profile?.id ?? null,
              }]
            : []
        }),
      )

      const behaviorPayload = enrollments.flatMap((enrollment) => {
        const behavior = drafts[enrollment.id]?.behavior
        return behavior
          ? [{
              enrollment_id: enrollment.id,
              term_id: termId,
              behavior_code: behavior,
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

      if (behaviorPayload.length) {
        const { error } = await supabase
          .from('behavior_records')
          .insert(behaviorPayload)
        if (error) throw error
      }

      setNotice('Valoraciones cualitativas y comportamiento guardados correctamente.')
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Cualitativas y comportamiento"
        description="Registre por trimestre Animación a la Lectura, Cívica y Acompañamiento Integral, y la evaluación comportamental."
        actions={canEdit ? (
          <button
            className="button button-primary"
            disabled={saving || !enrollments.length}
            onClick={() => void saveAll().catch((error) => setNotice(errorMessage(error)))}
          >
            <Save size={17} />
            {saving ? 'Guardando…' : 'Guardar curso'}
          </button>
        ) : undefined}
      />

      {notice && <div className="alert alert-info">{notice}</div>}

      {!canEdit && (
        <div className="alert alert-warning">
          La consulta está disponible para usuarios activos; la edición corresponde al director.
        </div>
      )}

      <section className="panel filters-panel">
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
            <span>Trimestre</span>
            <select value={termId} onChange={(event) => setTermId(event.target.value)}>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
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
            <h2>Valoraciones del trimestre</h2>
            <p>Estas valoraciones son independientes y no alteran los promedios cuantitativos.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="complementary-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                {subjects.map((subject) => (
                  <th key={subject.id}>{subject.abbreviation}<br /><small>{subject.name}</small></th>
                ))}
                <th>Comportamiento</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((enrollment) => (
                <tr key={enrollment.id}>
                  <td>
                    <strong>
                      {fullName(
                        enrollment.student?.first_names,
                        enrollment.student?.last_names,
                      )}
                    </strong>
                  </td>

                  {subjects.map((subject) => (
                    <td key={subject.id}>
                      <select
                        className="compact-select"
                        disabled={!canEdit}
                        value={drafts[enrollment.id]?.qualitative?.[subject.id] ?? ''}
                        onChange={(event) =>
                          updateQualitative(
                            enrollment.id,
                            subject.id,
                            event.target.value as QualitativeLetter | '',
                          )
                        }
                      >
                        <option value="">—</option>
                        {qualitativeOptions.map((letter) => (
                          <option key={letter} value={letter}>{letter}</option>
                        ))}
                      </select>
                    </td>
                  ))}

                  <td>
                    <select
                      className="behavior-select-wide"
                      disabled={!canEdit}
                      value={drafts[enrollment.id]?.behavior ?? ''}
                      onChange={(event) =>
                        updateBehavior(
                          enrollment.id,
                          event.target.value as BehaviorCode | '',
                        )
                      }
                    >
                      <option value="">Sin registrar</option>
                      {behaviorCatalog.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code} — {item.description}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}

              {!enrollments.length && (
                <tr>
                  <td colSpan={subjects.length + 2}>
                    No existen estudiantes matriculados en este curso.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
