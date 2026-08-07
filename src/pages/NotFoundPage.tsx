import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="not-found">
      <h1>404</h1>
      <h2>Página no encontrada</h2>
      <p>La ruta solicitada no existe dentro del sistema.</p>
      <Link className="button button-primary" to="/">Volver al panel</Link>
    </main>
  )
}
