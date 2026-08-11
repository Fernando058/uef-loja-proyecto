import { KeyRound, Plus, RefreshCw, UserCog } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { errorMessage } from '../lib/errors'
import { fullName } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { AppRole, Teacher } from '../types/domain'

interface ManagedUser {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  profile: {
    first_names: string | null
    last_names: string | null
    role: AppRole
    active: boolean
  } | null
}

interface UserDraft {
  email: string
  password: string
  first_names: string
  last_names: string
  role: AppRole
  teacher_id: string
}

const emptyDraft: UserDraft = {
  email: '',
  password: '',
  first_names: '',
  last_names: '',
  role: 'docente',
  teacher_id: '',
}

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<UserDraft>(emptyDraft)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: teacherData, error }, userData] = await Promise.all([
        supabase.from('teachers').select('*').eq('active', true).order('last_names'),
        invoke({ action: 'list' }),
      ])
      if (error) throw error
      setTeachers((teacherData ?? []) as Teacher[])
      setUsers((userData.users ?? []) as ManagedUser[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load().catch((error) => setNotice(errorMessage(error))) }, [load])

  const createUser = async () => {
    if (!draft.email || !draft.password || !draft.first_names || !draft.last_names) {
      setNotice('Complete correo, contraseña temporal, nombres y apellidos.')
      return
    }
    if (draft.role === 'docente' && !draft.teacher_id) {
      setNotice('Seleccione el registro docente que se vinculará a la cuenta.')
      return
    }
    await invoke({ action: 'create', ...draft })
    setOpen(false)
    setDraft(emptyDraft)
    setNotice('Cuenta creada y vinculada correctamente.')
    await load()
  }

  const resetPassword = async (user: ManagedUser) => {
    const password = window.prompt(`Nueva contraseña temporal para ${user.email}:`)
    if (!password) return
    if (password.length < 8) {
      setNotice('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    await invoke({ action: 'update_password', user_id: user.id, password })
    setNotice('Contraseña temporal actualizada.')
  }

  const toggleUser = async (user: ManagedUser) => {
    const active = !(user.profile?.active ?? true)
    await invoke({ action: 'set_active', user_id: user.id, active })
    setNotice(active ? 'Cuenta habilitada.' : 'Cuenta deshabilitada.')
    await load()
  }

  return <>
    <PageHeader title="Usuarios y accesos" description="Cree cuentas de director o docente. El usuario maestro se conserva en Supabase Auth." actions={<div className="button-row"><button className="button button-light" onClick={() => void load().catch((error) => setNotice(errorMessage(error)))}><RefreshCw size={17} /> Actualizar</button><button className="button button-primary" onClick={() => { setDraft(emptyDraft); setOpen(true) }}><Plus size={17} /> Nueva cuenta</button></div>} />
    {notice && <div className="alert alert-info">{notice}</div>}
    <section className="panel"><div className="panel-heading"><div><h2>Cuentas registradas</h2><p>La cuenta docente debe vincularse a un registro de Docentes.</p></div></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead><tbody>
      {users.map((user) => <tr key={user.id}><td><strong>{fullName(user.profile?.first_names, user.profile?.last_names) || 'Sin perfil'}</strong></td><td>{user.email}</td><td><span className="badge badge-primary">{user.profile?.role === 'director' ? 'Director' : 'Docente'}</span></td><td><span className={`badge ${user.profile?.active === false ? 'badge-muted' : 'badge-success'}`}>{user.profile?.active === false ? 'Inactiva' : 'Activa'}</span></td><td>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('es-EC') : 'Sin acceso'}</td><td className="actions-cell"><button className="button button-light button-small" onClick={() => void resetPassword(user).catch((error) => setNotice(errorMessage(error)))}><KeyRound size={14} /> Contraseña</button><button className="button button-secondary button-small" onClick={() => void toggleUser(user).catch((error) => setNotice(errorMessage(error)))}><UserCog size={14} /> {user.profile?.active === false ? 'Habilitar' : 'Deshabilitar'}</button></td></tr>)}
      {!users.length && <tr><td colSpan={6} className="empty-cell">{loading ? 'Cargando cuentas…' : 'No existen cuentas.'}</td></tr>}
    </tbody></table></div></section>

    <Modal open={open} title="Nueva cuenta de acceso" onClose={() => setOpen(false)}>
      <div className="form-grid"><label className="field"><span>Nombres</span><input value={draft.first_names} onChange={(event) => setDraft({ ...draft, first_names: event.target.value })} /></label><label className="field"><span>Apellidos</span><input value={draft.last_names} onChange={(event) => setDraft({ ...draft, last_names: event.target.value })} /></label><label className="field full-span"><span>Correo</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label className="field full-span"><span>Contraseña temporal</span><input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><small>Mínimo 8 caracteres.</small></label><label className="field full-span"><span>Rol</span><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AppRole, teacher_id: '' })}><option value="docente">Docente</option><option value="director">Director</option></select></label>{draft.role === 'docente' && <label className="field full-span"><span>Docente a vincular</span><select value={draft.teacher_id} onChange={(event) => { const teacher = teachers.find((item) => item.id === event.target.value); setDraft({ ...draft, teacher_id: event.target.value, first_names: teacher?.first_names ?? draft.first_names, last_names: teacher?.last_names ?? draft.last_names }) }}><option value="">Seleccione</option>{teachers.filter((teacher) => !teacher.profile_id).map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher.first_names, teacher.last_names)}</option>)}</select></label>}<div className="form-actions full-span"><button className="button button-light" onClick={() => setOpen(false)}>Cancelar</button><button className="button button-primary" onClick={() => void createUser().catch((error) => setNotice(errorMessage(error)))}>Crear cuenta</button></div></div>
    </Modal>
  </>
}
