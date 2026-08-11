import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AttendancePage } from './pages/AttendancePage'
import { ComplementaryPage } from './pages/ComplementaryPage'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { DashboardPage } from './pages/DashboardPage'
import { GradebookPage } from './pages/GradebookPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ReportCardsPage } from './pages/ReportCardsPage'
import { ReportsPage } from './pages/ReportsPage'
import { RecoveryPage } from './pages/RecoveryPage'
import { StudentsPage } from './pages/StudentsPage'
import { TeachersPage } from './pages/TeachersPage'
import { UsersPage } from './pages/UsersPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/estudiantes" element={<StudentsPage />} />
            <Route path="/docentes" element={<TeachersPage />} />
            <Route path="/calificaciones" element={<GradebookPage />} />
            <Route path="/proyectos" element={<ProjectsPage />} />
            <Route path="/supletorio" element={<RecoveryPage />} />
            <Route path="/recuperacion" element={<RecoveryPage />} />

            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/reportes/analitica" element={<ReportsPage />} />
            <Route path="/reportes/complementarios" element={<ComplementaryPage />} />
            <Route path="/reportes/boletas" element={<ReportCardsPage />} />
            <Route path="/reportes/asistencia" element={<AttendancePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['director']} />}>
          <Route element={<AppShell />}>
            <Route path="/configuracion" element={<ConfigurationPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  )
}
