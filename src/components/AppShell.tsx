import {
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
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
  { to: '/proyectos', label: 'Proyecto interdisciplinar', icon: FolderKanban },
  { to: '/supletorio', label: 'Supletorio', icon: RotateCcw },
]

const reportLinks = [
  { to: '/reportes/analitica', label: 'Analítica académica', icon: BarChart3 },
  { to: '/reportes/complementarios', label: 'Cualitativas y comportamiento', icon: ClipboardList },
  { to: '/reportes/boletas', label: 'Boletas individuales', icon: FileText },
  { to: '/reportes/asistencia', label: 'Asistencia resumida', icon: CalendarDays },
]

const directorLinks = [
  { to: '/configuracion', label: 'Configuración académica', icon: Settings },
  { to: '/usuarios', label: 'Usuarios y accesos', icon: UserRoundCog },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  const renderLink = (
    { to, label, icon: Icon }: (typeof baseLinks)[number],
    nested = false,
  ) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `${isActive ? 'nav-link active' : 'nav-link'}${nested ? ' nav-link-nested' : ''}`
      }
    >
      <Icon size={nested ? 17 : 19} />
      <span>{label}</span>
    </NavLink>
  )

  return (
    <div className="app-layout">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><Building2 size={26} /></div>
          <div><strong>UEF Loja</strong><span>Gestión Académica V2</span></div>
          <button
            className="sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {baseLinks.map((item) => renderLink(item))}
          <div className="nav-group-label">REPORTES Y ANALÍTICA</div>
          {reportLinks.map((item) => renderLink(item, true))}

          {profile?.role === 'director' && (
            <>
              <div className="nav-group-label">ADMINISTRACIÓN</div>
              {directorLinks.map((item) => renderLink(item))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <ShieldCheck size={18} />
            <div>
              <strong>
                {fullName(profile?.first_names, profile?.last_names) || profile?.email}
              </strong>
              <span>{profile?.role === 'director' ? 'Director' : 'Docente'}</span>
            </div>
          </div>

          <button className="nav-link signout" onClick={() => void signOut()}>
            <LogOut size={19} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-topbar">
          <button
            className="icon-button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={23} />
          </button>
          <div><strong>UEF Loja</strong><span>Gestión Académica V2</span></div>
        </header>

        <main className="content-area"><Outlet /></main>
      </div>

      {open && (
        <button
          className="sidebar-overlay"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}
    </div>
  )
}
