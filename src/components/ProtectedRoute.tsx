import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader } from './Loader'
import type { AppRole } from '../types/domain'

export function ProtectedRoute({ roles }: { roles?: AppRole[] }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <Loader label="Verificando sesión…" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile?.active) return <Navigate to="/login" replace />
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
