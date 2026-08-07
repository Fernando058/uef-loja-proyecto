import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AcademicPlaceholder } from './pages/AcademicPlaceholder'
import { AttendancePage } from './pages/AttendancePage'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { DashboardPage } from './pages/DashboardPage'
import { GradebookPage } from './pages/GradebookPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
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
            <Route path="/recuperacion" element={<RecoveryPage />} />

            {/* Ruta anterior conservada por compatibilidad */}
            <Route path="/reportes" element={<ReportsPage />} />

            {/* Nuevas rutas del submenú Reportes y analítica */}
            <Route path="/reportes/analitica" element={<ReportsPage />} />
            <Route path="/reportes/boletas" element={<ReportCardsPage />} />
            <Route path="/reportes/asistencia" element={<AttendancePage />} />

            <Route path="/ayuda" element={<AcademicPlaceholder />} />
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
