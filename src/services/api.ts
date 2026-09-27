import { apiUrl } from './config'

type ApiEnvelope<T> = { data: T }

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un problema inesperado. Intenta nuevamente.'
}

function statusMessage(status: number, body: unknown): string {
  if (status === 400) return 'Revisa los datos ingresados.'
  if (status === 404) return 'El registro solicitado no se encuentra disponible.'
  if (status === 409) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      && typeof body.error === 'object' && body.error !== null && 'message' in body.error
      ? body.error.message : null
    return message === 'Stock insuficiente' ? 'No hay unidades suficientes para esta compra.'
      : 'Estos datos ya están registrados o entran en conflicto con la compra.'
  }
  return status >= 500 ? 'No pudimos completar tu solicitud. Intenta más tarde.'
    : 'No se pudo completar la solicitud.'
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new ApiError('No podemos procesar tu compra en este momento. Intenta más tarde.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      signal: controller.signal,
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(statusMessage(response.status, body), response.status)
    if (typeof body !== 'object' || body === null || !('data' in body)) {
      throw new ApiError('No pudimos cargar la información. Intenta de nuevo.')
    }
    return (body as ApiEnvelope<T>).data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new ApiError('La solicitud tardó demasiado. Comprueba el estado antes de reintentar.')
    }
    if (options.signal?.aborted) throw error
    throw new ApiError('No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
