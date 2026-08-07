import {
  BarChart3,
  BookOpenCheck,
  RotateCcw,
  Building2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fullName } from '../lib/format'

const baseLinks = [
  { to: '/', label: 'Panel principal', icon: LayoutDashboard },
  { to: '/estudiantes', label: 'Estudiantes', icon: GraduationCap },
  { to: '/docentes', label: 'Docentes', icon: Users },
  { to: '/calificaciones', label: 'Calificaciones', icon: BookOpenCheck },
  { to: '/recuperacion', label: 'Recuperación', icon: RotateCcw },
  { to: '/reportes', label: 'Reportes y analítica', icon: BarChart3 },
]

const directorLinks = [
  { to: '/configuracion', label: 'Configuración académica', icon: Settings },
  { to: '/usuarios', label: 'Usuarios y accesos', icon: UserRoundCog },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const links = profile?.role === 'director' ? [...baseLinks, ...directorLinks] : baseLinks

  return (
    <div className="app-layout">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><Building2 size={26} /></div>
          <div>
            <strong>UEF Loja</strong>
            <span>Gestión Académica</span>
          </div>
          <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <ShieldCheck size={18} />
            <div>
              <strong>{fullName(profile?.first_names, profile?.last_names) || profile?.email}</strong>
              <span>{profile?.role === 'director' ? 'Director' : 'Docente'}</span>
            </div>
          </div>
          <button className="nav-link signout" onClick={() => signOut()}>
            <LogOut size={19} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-topbar">
          <button className="icon-button" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu size={23} />
          </button>
          <div>
            <strong>UEF Loja</strong>
            <span>Gestión Académica</span>
          </div>
        </header>
        <main className="content-area">
          <Outlet />
        </main>
      </div>
      {open && <button className="sidebar-overlay" onClick={() => setOpen(false)} aria-label="Cerrar menú" />}
    </div>
  )
}
