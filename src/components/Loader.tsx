export function Loader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loader-wrap" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  )
}
