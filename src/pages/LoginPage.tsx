import { zodResolver } from '@hookform/resolvers/zod'
import { LockKeyhole, School } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import type { z } from 'zod'
import { Loader } from '../components/Loader'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../lib/errors'
import { loginSchema } from '../lib/validators'

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { session, profile, loading, signIn } = useAuth()
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (loading) return <Loader label="Verificando sesión…" />

  // Solo se redirige cuando la sesión y el perfil activo están listos.
  // Esto evita un ciclo /login ↔ / cuando el perfil todavía se está cargando.
  if (session && profile?.active) return <Navigate to="/" replace />

  const submit = async (values: LoginValues) => {
    setServerError('')
    try {
      await signIn(values.email, values.password)
    } catch (error) {
      setServerError(errorMessage(error, 'No fue posible iniciar sesión'))
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="login-hero-content">
          <div className="hero-icon"><School size={38} /></div>
          <p className="eyebrow">Unidad Educativa Fiscal Loja</p>
          <h1>Evaluación académica con información clara y oportuna.</h1>
          <p>
            Registro de calificaciones, seguimiento trimestral, reportes anuales y analítica de rendimiento en una sola plataforma.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit(submit)}>
          <div className="login-title">
            <div className="login-lock"><LockKeyhole size={22} /></div>
            <div>
              <h2>Acceso al sistema</h2>
              <p>Ingrese con la cuenta asignada por la dirección.</p>
            </div>
          </div>

          <label className="field">
            <span>Correo electrónico</span>
            <input type="email" autoComplete="email" {...register('email')} />
            {errors.email && <small className="field-error">{errors.email.message}</small>}
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <small className="field-error">{errors.password.message}</small>}
          </label>

          {serverError && <div className="alert alert-error">{serverError}</div>}

          <button className="button button-primary button-block" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>
      </section>
    </main>
  )
}
