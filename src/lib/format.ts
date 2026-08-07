export const fullName = (firstNames?: string | null, lastNames?: string | null) =>
  [lastNames, firstNames].filter(Boolean).join(' ').trim()

export const formatScore = (value?: number | null) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(2)

export const normalizeNullable = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export const scoreBand = (value: number | null) => {
  if (value === null) return 'Sin datos'
  if (value >= 8.5) return 'Excelente'
  if (value >= 6.5) return 'Bueno'
  return 'Necesita refuerzo'
}
