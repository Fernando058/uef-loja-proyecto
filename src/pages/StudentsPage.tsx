import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Search, UserRoundPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { fullName, normalizeNullable } from '../lib/format'
import { supabase } from '../lib/supabase'
import { studentSchema } from '../lib/validators'
import type { AcademicYear, Course, Enrollment, EnrollmentStatus, Student } from '../types/domain'

type StudentForm = z.infer<typeof studentSchema>

interface EnrollmentDraft {
  academic_year_id: string
  course_id: string
  enrolled_on: string
  status: EnrollmentStatus
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

const emptyEnrollment = (): EnrollmentDraft => ({
  academic_year_id: '',
  course_id: '',
  enrolled_on: new Date().toISOString().slice(0, 10),
  status: 'active',
  withdrawn_on: '',
  withdrawal_reason: '',
})

export function StudentsPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'director'
  const [students, setStudents] = useState<Student[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Student | null>(null)
  const [enrolling, setEnrolling] = useState<Student | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [enrollmentDraft, setEnrollmentDraft] = useState<EnrollmentDraft>(emptyEnrollment())

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentForm>({ resolver: zodResolver(studentSchema), defaultValues: emptyStudent })

  const load = useCallback(async () => {
    const [studentRes, yearRes, courseRes, enrollmentRes] = await Promise.all([
      supabase.from('students').select('*').order('last_names').order('first_names'),
      supabase.from('academic_years').select('*').order('start_date', { ascending: false }),
      supabase.from('courses').select('*,grade_level:grade_levels(*)'),
      supabase.from('enrollments').select('*,course:courses(*,grade_level:grade_levels(*))'),
    ])
    const firstError = [studentRes, yearRes, courseRes, enrollmentRes].find((item) => item.error)?.error
    if (firstError) throw firstError
    setStudents((studentRes.data ?? []) as Student[])
    setYears((yearRes.data ?? []) as AcademicYear[])
    setCourses(((courseRes.data ?? []) as Course[]).sort((a, b) => (a.grade_level?.ordinal ?? 99) - (b.grade_level?.ordinal ?? 99) || a.parallel.localeCompare(b.parallel, 'es')))
    setEnrollments((enrollmentRes.data ?? []) as Enrollment[])
  }, [])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const activeYear = years.find((year) => year.active) ?? years[0]
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    if (!term) return students
    return students.filter((student) => `${student.first_names} ${student.last_names} ${student.national_id ?? ''}`.toLocaleLowerCase('es').includes(term))
  }, [students, search])

  const selectedYearCourses = courses.filter((course) => course.academic_year_id === enrollmentDraft.academic_year_id && course.active)

  const currentEnrollment = (studentId: string) => {
    const yearId = activeYear?.id
    if (!yearId) return undefined
    return enrollments.find((item) => item.student_id === studentId && item.academic_year_id === yearId)
  }

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

  const openEnrollment = async (student: Student) => {
    setEnrolling(student)
    const yearId = activeYear?.id ?? years[0]?.id ?? ''
    const existing = enrollments.find((item) => item.student_id === student.id && item.academic_year_id === yearId)
    setEnrollmentDraft(existing ? {
      academic_year_id: existing.academic_year_id,
      course_id: existing.course_id,
      enrolled_on: existing.enrolled_on,
      status: existing.status,
      withdrawn_on: existing.withdrawn_on ?? '',
      withdrawal_reason: existing.withdrawal_reason ?? '',
    } : {
      ...emptyEnrollment(),
      academic_year_id: yearId,
      course_id: courses.find((course) => course.academic_year_id === yearId && course.active)?.id ?? '',
    })
  }

  const loadEnrollmentForYear = (yearId: string) => {
    if (!enrolling) return
    const existing = enrollments.find((item) => item.student_id === enrolling.id && item.academic_year_id === yearId)
    setEnrollmentDraft(existing ? {
      academic_year_id: existing.academic_year_id,
      course_id: existing.course_id,
      enrolled_on: existing.enrolled_on,
      status: existing.status,
      withdrawn_on: existing.withdrawn_on ?? '',
      withdrawal_reason: existing.withdrawal_reason ?? '',
    } : {
      ...emptyEnrollment(),
      academic_year_id: yearId,
      course_id: courses.find((course) => course.academic_year_id === yearId && course.active)?.id ?? '',
    })
  }

  const saveEnrollment = async () => {
    if (!enrolling || !enrollmentDraft.academic_year_id || !enrollmentDraft.course_id) {
      setNotice('Seleccione año lectivo y curso.')
      return
    }
    const payload = {
      student_id: enrolling.id,
      academic_year_id: enrollmentDraft.academic_year_id,
      course_id: enrollmentDraft.course_id,
      enrolled_on: enrollmentDraft.enrolled_on || new Date().toISOString().slice(0, 10),
      status: enrollmentDraft.status,
      withdrawn_on: enrollmentDraft.status === 'withdrawn' || enrollmentDraft.status === 'transferred' ? normalizeNullable(enrollmentDraft.withdrawn_on) : null,
      withdrawal_reason: enrollmentDraft.status === 'withdrawn' || enrollmentDraft.status === 'transferred' ? normalizeNullable(enrollmentDraft.withdrawal_reason) : null,
    }
    const { error } = await supabase.from('enrollments').upsert(payload, { onConflict: 'student_id,academic_year_id' })
    if (error) throw error
    setEnrolling(null)
    setNotice('Matrícula guardada correctamente.')
    await load()
  }

  return (
    <>
      <PageHeader
        title="Estudiantes y matrículas"
        description="El estudiante se registra una sola vez. Cada año lectivo se crea o actualiza su matrícula sin alterar el historial anterior."
        actions={canManage ? <button className="button button-primary" onClick={openCreate}><Plus size={18} /> Nuevo estudiante</button> : undefined}
      />
      {notice && <div className="alert alert-info">{notice}</div>}

      <section className="panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o identificación" /></label>
          <span className="record-count">{filtered.length} estudiante(s)</span>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>Identificación</th><th>Nacimiento</th><th>Matrícula {activeYear?.name ?? ''}</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          {filtered.map((student) => {
            const enrollment = currentEnrollment(student.id)
            return <tr key={student.id}>
              <td><strong>{fullName(student.first_names, student.last_names)}</strong></td>
              <td>{student.national_id || 'Pendiente'}</td>
              <td>{student.birth_date || 'Pendiente'}</td>
              <td>{enrollment ? `${enrollment.course?.grade_level?.name ?? 'Curso'} “${enrollment.course?.parallel ?? ''}”` : <span className="badge badge-warning">Sin matrícula</span>}</td>
              <td><span className={`badge ${student.active ? 'badge-success' : 'badge-muted'}`}>{student.active ? 'Activo' : 'Inactivo'}</span></td>
              <td className="actions-cell">{canManage ? <><button className="button button-light button-small" onClick={() => openEdit(student)}><Pencil size={14} /> Editar</button><button className="button button-secondary button-small" onClick={() => void openEnrollment(student)}><UserRoundPlus size={14} /> Matrícula</button></> : <span className="badge badge-muted">Consulta</span>}</td>
            </tr>
          })}
          {!filtered.length && <tr><td colSpan={6} className="empty-cell">No existen estudiantes registrados.</td></tr>}
        </tbody></table></div>
      </section>

      <Modal open={formOpen} title={editing ? 'Editar estudiante' : 'Nuevo estudiante'} onClose={() => setFormOpen(false)}>
        <form className="form-grid" onSubmit={handleSubmit(saveStudent)}>
          <label className="field"><span>Nombres *</span><input {...register('first_names')} />{errors.first_names && <small className="field-error">{errors.first_names.message}</small>}</label>
          <label className="field"><span>Apellidos *</span><input {...register('last_names')} />{errors.last_names && <small className="field-error">{errors.last_names.message}</small>}</label>
          <label className="field"><span>Cédula / identificación</span><input {...register('national_id')} /></label>
          <label className="field"><span>Fecha de nacimiento</span><input type="date" {...register('birth_date')} /></label>
          <label className="check-field full-span"><input type="checkbox" {...register('active')} /><span>Estudiante activo</span></label>
          <div className="form-actions full-span"><button type="button" className="button button-light" onClick={() => setFormOpen(false)}>Cancelar</button><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar'}</button></div>
        </form>
      </Modal>

      <Modal open={Boolean(enrolling)} title={`Matrícula · ${enrolling ? fullName(enrolling.first_names, enrolling.last_names) : ''}`} onClose={() => setEnrolling(null)}>
        <div className="form-grid">
          <label className="field full-span"><span>Año lectivo</span><select value={enrollmentDraft.academic_year_id} onChange={(event) => loadEnrollmentForYear(event.target.value)}><option value="">Seleccione</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label className="field full-span"><span>Curso y paralelo</span><select value={enrollmentDraft.course_id} onChange={(event) => setEnrollmentDraft({ ...enrollmentDraft, course_id: event.target.value })}><option value="">Seleccione</option>{selectedYearCourses.map((course) => <option key={course.id} value={course.id}>{course.grade_level?.name} “{course.parallel}” · {course.grade_level?.evaluation_model === 'simple_average' ? 'Promedio simple' : '70/30'}</option>)}</select></label>
          <label className="field"><span>Fecha de matrícula</span><input type="date" value={enrollmentDraft.enrolled_on} onChange={(event) => setEnrollmentDraft({ ...enrollmentDraft, enrolled_on: event.target.value })} /></label>
          <label className="field"><span>Estado</span><select value={enrollmentDraft.status} onChange={(event) => setEnrollmentDraft({ ...enrollmentDraft, status: event.target.value as EnrollmentStatus })}><option value="active">Activo</option><option value="completed">Completado</option><option value="withdrawn">Retirado</option><option value="transferred">Trasladado</option></select></label>
          {(enrollmentDraft.status === 'withdrawn' || enrollmentDraft.status === 'transferred') && <><label className="field"><span>Fecha de salida</span><input type="date" value={enrollmentDraft.withdrawn_on} onChange={(event) => setEnrollmentDraft({ ...enrollmentDraft, withdrawn_on: event.target.value })} /></label><label className="field"><span>Motivo</span><input value={enrollmentDraft.withdrawal_reason} onChange={(event) => setEnrollmentDraft({ ...enrollmentDraft, withdrawal_reason: event.target.value })} /></label></>}
          <div className="form-actions full-span"><button className="button button-light" onClick={() => setEnrolling(null)}>Cancelar</button><button className="button button-primary" onClick={() => void saveEnrollment().catch((error) => setNotice(errorMessage(error)))}>Guardar matrícula</button></div>
        </div>
      </Modal>
    </>
  )
}
