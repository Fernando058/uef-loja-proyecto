import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Search } from 'lucide-react'
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
import { teacherSchema } from '../lib/validators'
import type { Teacher } from '../types/domain'

type TeacherForm = z.infer<typeof teacherSchema>

const emptyTeacher: TeacherForm = {
  first_names: '',
  last_names: '',
  national_id: '',
  active: true,
}

export function TeachersPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'director'
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TeacherForm>({ resolver: zodResolver(teacherSchema), defaultValues: emptyTeacher })

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('teachers').select('*').order('last_names').order('first_names')
    if (error) throw error
    setTeachers((data ?? []) as Teacher[])
  }, [])

  useEffect(() => {
    void load().catch((error) => setNotice(errorMessage(error)))
  }, [load])

  const filtered = useMemo(() => {
    const term = search.toLocaleLowerCase('es').trim()
    if (!term) return teachers
    return teachers.filter((teacher) =>
      `${teacher.first_names} ${teacher.last_names} ${teacher.national_id ?? ''}`.toLocaleLowerCase('es').includes(term),
    )
  }, [search, teachers])

  const create = () => {
    setEditing(null)
    reset(emptyTeacher)
    setOpen(true)
  }

  const edit = (teacher: Teacher) => {
    setEditing(teacher)
    reset({
      first_names: teacher.first_names,
      last_names: teacher.last_names,
      national_id: teacher.national_id ?? '',
      active: teacher.active,
    })
    setOpen(true)
  }

  const toggleTeacher = async (teacher: Teacher) => {
    const { error } = await supabase.from('teachers').update({ active: !teacher.active }).eq('id', teacher.id)
    if (error) throw error
    setNotice(teacher.active ? 'Docente desactivado.' : 'Docente activado.')
    await load()
  }

  const save = async (values: TeacherForm) => {
    const payload = {
      first_names: values.first_names.trim(),
      last_names: values.last_names.trim(),
      national_id: normalizeNullable(values.national_id ?? ''),
      active: values.active,
    }
    const query = editing
      ? supabase.from('teachers').update(payload).eq('id', editing.id)
      : supabase.from('teachers').insert(payload)
    const { error } = await query
    if (error) throw error
    setOpen(false)
    setNotice(editing ? 'Docente actualizado.' : 'Docente registrado. Cree su cuenta en Usuarios y accesos.')
    await load()
  }

  return (
    <>
      <PageHeader
        title="Docentes"
        description="Administre los datos básicos del personal docente. Las cuentas de acceso se crean por separado."
        actions={canManage ? <button className="button button-primary" onClick={create}><Plus size={18} /> Nuevo docente</button> : undefined}
      />
      {notice && <div className="alert alert-info">{notice}</div>}
      <section className="panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar docente" /></label>
          <span className="record-count">{filtered.length} registro(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Docente</th><th>Cédula</th><th>Cuenta vinculada</th><th>Estado</th><th className="actions-cell">Acciones</th></tr></thead>
            <tbody>
              {filtered.map((teacher) => (
                <tr key={teacher.id}>
                  <td><strong>{fullName(teacher.first_names, teacher.last_names)}</strong></td>
                  <td>{teacher.national_id || 'Pendiente'}</td>
                  <td>{teacher.user_id ? <span className="badge badge-success">Sí</span> : <span className="badge badge-warning">No</span>}</td>
                  <td><span className={`badge ${teacher.active ? 'badge-success' : 'badge-muted'}`}>{teacher.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="actions-cell">{canManage ? <><button className="button button-light button-small" onClick={() => edit(teacher)}><Pencil size={15} /> Editar</button><ConfirmButton label={teacher.active ? 'Desactivar' : 'Activar'} confirmLabel="Confirmar" onConfirm={() => toggleTeacher(teacher)} className={teacher.active ? 'button button-danger button-small' : 'button button-secondary button-small'} /></> : <span className="badge badge-muted">Consulta</span>}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5} className="empty-cell">No existen docentes registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={open} title={editing ? 'Editar docente' : 'Nuevo docente'} onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={handleSubmit(save)}>
          <label className="field"><span>Nombres *</span><input {...register('first_names')} />{errors.first_names && <small className="field-error">{errors.first_names.message}</small>}</label>
          <label className="field"><span>Apellidos *</span><input {...register('last_names')} />{errors.last_names && <small className="field-error">{errors.last_names.message}</small>}</label>
          <label className="field full-span"><span>Cédula</span><input {...register('national_id')} /></label>
          <label className="check-field full-span"><input type="checkbox" {...register('active')} /><span>Docente activo</span></label>
          <div className="form-actions full-span"><button type="button" className="button button-light" onClick={() => setOpen(false)}>Cancelar</button><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar'}</button></div>
        </form>
      </Modal>
    </>
  )
}
