import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Search, UserRoundPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { ConfirmButton } from '../components/ConfirmButton'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { fullName, normalizeNullable } from '../lib/format'
import { supabase } from '../lib/supabase'
import { studentSchema } from '../lib/validators'
import type { AcademicYear, Course, Student } from '../types/domain'

type StudentForm = z.infer<typeof studentSchema>

interface EnrollmentForm {
  academic_year_id: string
  course_id: string
  enrolled_on: string
  status: 'active' | 'withdrawn' | 'transferred' | 'completed'
  withdrawn_on: string
  withdrawal_reason: string
}

const emptyStudent: StudentForm = {
  first_names: '',
  last_names: '',
  national_id: '',
  birth_date: '',
  active: true,
}

export function StudentsPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'director'
  const [students, setStudents] = useState<Student[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Student | null>(null)
  const [enrolling, setEnrolling] = useState<Student | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [enrollment, setEnrollment] = useState<EnrollmentForm>({
    academic_year_id: '',
    course_id: '',
    enrolled_on: new Date().toISOString().slice(0, 10),
    status: 'active',
    withdrawn_on: '',
    withdrawal_reason: '',
  })

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentForm>({ resolver: zodResolver(studentSchema), defaultValues: emptyStudent })

  const load = useCallback(async () => {
    const [{ data: studentData, error }, { data: yearData }, { data: courseData }] = await Promise.all([
      supabase.from('students').select('*').order('last_names').order('first_names'),
      supabase.from('academic_years').select('*').order('starts_on', { ascending: false }),
      supabase.from('courses').select('*').order('grade_level').order('parallel'),
    ])
    if (error) throw error
    setStudents((studentData ?? []) as Student[])
    setYears((yearData ?? []) as AcademicYear[])
    setCourses((courseData ?? []) as Course[])
  }, [])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    if (!term) return students
    return students.filter((student) =>
      `${student.first_names} ${student.last_names} ${student.national_id ?? ''}`
        .toLocaleLowerCase('es')
        .includes(term),
    )
  }, [students, search])

  const openCreate = () => {
    setEditing(null)
    reset(emptyStudent)
    setFormOpen(true)
  }

  const openEdit = (student: Student) => {
    setEditing(student)
    reset({
      first_names: student.first_names,
      last_names: student.last_names,
      national_id: student.national_id ?? '',
      birth_date: student.birth_date ?? '',
      active: student.active,
    })
    setFormOpen(true)
  }

  const saveStudent = async (values: StudentForm) => {
    setNotice('')
    const payload = {
      first_names: values.first_names.trim(),
      last_names: values.last_names.trim(),
      national_id: normalizeNullable(values.national_id ?? ''),
      birth_date: normalizeNullable(values.birth_date ?? ''),
      active: values.active,
    }

    const query = editing
      ? supabase.from('students').update(payload).eq('id', editing.id)
      : supabase.from('students').insert(payload)
    const { error } = await query
    if (error) throw error
    setFormOpen(false)
    setNotice(editing ? 'Estudiante actualizado.' : 'Estudiante registrado.')
    await load()
  }

  const toggleStudent = async (student: Student) => {
    const { error } = await supabase.from('students').update({ active: !student.active }).eq('id', student.id)
    if (error) throw error
    setNotice(student.active ? 'Estudiante desactivado.' : 'Estudiante activado.')
    await load()
  }

  const loadEnrollmentDraft = async (student: Student, academicYearId: string) => {
    if (!academicYearId) {
      setEnrollment({
        academic_year_id: '',
        course_id: '',
        enrolled_on: new Date().toISOString().slice(0, 10),
        status: 'active',
        withdrawn_on: '',
        withdrawal_reason: '',
      })
      return
    }

    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', student.id)
      .eq('academic_year_id', academicYearId)
      .maybeSingle()
    if (error) throw error

    setEnrollment({
      academic_year_id: academicYearId,
      course_id: data?.course_id ?? '',
      enrolled_on: data?.enrolled_on ?? new Date().toISOString().slice(0, 10),
      status: data?.status ?? 'active',
      withdrawn_on: data?.withdrawn_on ?? '',
      withdrawal_reason: data?.withdrawal_reason ?? '',
    })
  }

  const openEnrollment = async (student: Student) => {
    setEnrolling(student)
    const year = years.find((item) => item.active) ?? years[0]
    await loadEnrollmentDraft(student, year?.id ?? '')
  }

  const saveEnrollment = async () => {
    if (!enrolling || !enrollment.academic_year_id || !enrollment.course_id) {
      setNotice('Seleccione el año lectivo y el curso.')
      return
    }
    const { error } = await supabase.from('enrollments').upsert(
      {
        student_id: enrolling.id,
        academic_year_id: enrollment.academic_year_id,
        course_id: enrollment.course_id,
        enrolled_on: enrollment.enrolled_on,
        status: enrollment.status,
        withdrawn_on: enrollment.status === 'withdrawn' || enrollment.status === 'transferred' ? (enrollment.withdrawn_on || new Date().toISOString().slice(0, 10)) : null,
        withdrawal_reason: enrollment.status === 'withdrawn' || enrollment.status === 'transferred' ? (enrollment.withdrawal_reason.trim() || null) : null,
      },
      { onConflict: 'student_id,academic_year_id' },
    )
    if (error) throw error
    setEnrolling(null)
    setNotice('Matrícula guardada correctamente.')
  }

  const selectedYearCourses = courses.filter((course) => course.academic_year_id === enrollment.academic_year_id)

  return (
    <>
      <PageHeader
        title="Estudiantes"
        description="Registre los datos básicos y asigne cada estudiante a un curso por año lectivo."
        actions={canManage ? (
          <button className="button button-primary" onClick={openCreate}>
            <Plus size={18} /> Nuevo estudiante
          </button>
        ) : undefined}
      />

      {notice && <div className="alert alert-info">{notice}</div>}

      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o cédula"
            />
          </label>
          <span className="record-count">{filtered.length} registro(s)</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Cédula</th>
                <th>Fecha de nacimiento</th>
                <th>Estado</th>
                <th className="actions-cell">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => (
                <tr key={student.id}>
                  <td><strong>{fullName(student.first_names, student.last_names)}</strong></td>
                  <td>{student.national_id || 'Pendiente'}</td>
                  <td>{student.birth_date || 'Pendiente'}</td>
                  <td><span className={`badge ${student.active ? 'badge-success' : 'badge-muted'}`}>{student.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="actions-cell">
                    {canManage ? (
                      <>
                        <button className="button button-light button-small" onClick={() => openEdit(student)}>
                          <Pencil size={15} /> Editar
                        </button>
                        <button
                          className="button button-secondary button-small"
                          onClick={() => void openEnrollment(student).catch((error) => setNotice(errorMessage(error)))}
                        >
                          <UserRoundPlus size={15} /> Matrícula
                        </button>
                        <ConfirmButton
                          label={student.active ? 'Desactivar' : 'Activar'}
                          confirmLabel={student.active ? 'Confirmar baja' : 'Confirmar activación'}
                          onConfirm={() => toggleStudent(student)}
                          className={student.active ? 'button button-danger button-small' : 'button button-secondary button-small'}
                        />
                      </>
                    ) : <span className="badge badge-muted">Consulta</span>}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={5} className="empty-cell">No existen estudiantes con ese criterio.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={formOpen} title={editing ? 'Editar estudiante' : 'Nuevo estudiante'} onClose={() => setFormOpen(false)}>
        <form className="form-grid" onSubmit={handleSubmit(saveStudent)}>
          <label className="field">
            <span>Nombres *</span>
            <input {...register('first_names')} />
            {errors.first_names && <small className="field-error">{errors.first_names.message}</small>}
          </label>
          <label className="field">
            <span>Apellidos *</span>
            <input {...register('last_names')} />
            {errors.last_names && <small className="field-error">{errors.last_names.message}</small>}
          </label>
          <label className="field">
            <span>Cédula</span>
            <input {...register('national_id')} />
          </label>
          <label className="field">
            <span>Fecha de nacimiento</span>
            <input type="date" {...register('birth_date')} />
          </label>
          <label className="check-field full-span">
            <input type="checkbox" {...register('active')} />
            <span>Estudiante activo</span>
          </label>
          <div className="form-actions full-span">
            <button type="button" className="button button-light" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(enrolling)} title={`Matrícula de ${enrolling ? fullName(enrolling.first_names, enrolling.last_names) : ''}`} onClose={() => setEnrolling(null)}>
        <div className="form-grid">
          <label className="field full-span">
            <span>Año lectivo</span>
            <select
              value={enrollment.academic_year_id}
              onChange={(event) => {
                const nextYearId = event.target.value
                if (enrolling) {
                  void loadEnrollmentDraft(enrolling, nextYearId).catch((error) => setNotice(errorMessage(error)))
                }
              }}
            >
              <option value="">Seleccione</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
          <label className="field full-span">
            <span>Curso y paralelo</span>
            <select value={enrollment.course_id} onChange={(event) => setEnrollment({ ...enrollment, course_id: event.target.value })}>
              <option value="">Seleccione</option>
              {selectedYearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level} “{course.parallel}”</option>)}
            </select>
          </label>
          <label className="field full-span">
            <span>Fecha de matrícula</span>
            <input type="date" value={enrollment.enrolled_on} onChange={(event) => setEnrollment({ ...enrollment, enrolled_on: event.target.value })} />
          </label>
          <label className="field full-span">
            <span>Estado de matrícula</span>
            <select value={enrollment.status} onChange={(event) => setEnrollment({ ...enrollment, status: event.target.value as EnrollmentForm['status'] })}>
              <option value="active">Activo</option>
              <option value="withdrawn">Retirado</option>
              <option value="transferred">Trasladado</option>
              <option value="completed">Completado</option>
            </select>
          </label>
          {(enrollment.status === 'withdrawn' || enrollment.status === 'transferred') && <>
            <label className="field"><span>Fecha de salida</span><input type="date" value={enrollment.withdrawn_on} onChange={(event) => setEnrollment({ ...enrollment, withdrawn_on: event.target.value })} /></label>
            <label className="field"><span>Motivo</span><input value={enrollment.withdrawal_reason} onChange={(event) => setEnrollment({ ...enrollment, withdrawal_reason: event.target.value })} /></label>
          </>}
          <div className="form-actions full-span">
            <button className="button button-light" onClick={() => setEnrolling(null)}>Cancelar</button>
            <button className="button button-primary" onClick={() => void saveEnrollment().catch((error) => setNotice(errorMessage(error)))}>Guardar matrícula</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
