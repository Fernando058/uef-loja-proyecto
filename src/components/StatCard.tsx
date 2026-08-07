import type { LucideIcon } from 'lucide-react'

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string
  value: string | number
  helper?: string
  icon: LucideIcon
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon"><Icon size={22} /></div>
      <div>
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        {helper && <small>{helper}</small>}
      </div>
    </article>
  )
}
