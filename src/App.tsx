import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AcademicPlaceholder } from './pages/AcademicPlaceholder'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { DashboardPage } from './pages/DashboardPage'
import { GradebookPage } from './pages/GradebookPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
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
            <Route path="estudiantes" element={<StudentsPage />} />
            <Route path="docentes" element={<TeachersPage />} />
            <Route path="calificaciones" element={<GradebookPage />} />
            <Route path="reportes" element={<ReportsPage />} />
            <Route path="recuperacion" element={<RecoveryPage />} />
            <Route path="ayuda" element={<AcademicPlaceholder />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={['director']} />}>
          <Route element={<AppShell />}>
            <Route path="configuracion" element={<ConfigurationPage />} />
            <Route path="usuarios" element={<UsersPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  )
}
