export function errorMessage(error: unknown, fallback = 'Ocurrió un error inesperado') {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
