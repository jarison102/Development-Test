import type { PurchaseSummary } from '../types/checkout'
import type { TransactionRecord, TransactionStatus } from '../types/transaction'
import { ApiError, apiRequest } from './api'

type ApiQuote = {
  productoId: number
  cantidad: number
  subtotal: string
  tarifaBase: string
  tarifaEnvio: string
  total: string
}

export type ApiTransaction = ApiQuote & {
  id: number
  referencia: string
  clienteId: number
  estado: TransactionStatus
  idTransaccionExterna: string | null
}

function toQuote(data: ApiQuote): PurchaseSummary {
  if (!Number.isSafeInteger(data.productoId) || !Number.isSafeInteger(data.cantidad)
    || ![data.subtotal, data.tarifaBase, data.tarifaEnvio, data.total]
      .every((amount) => typeof amount === 'string' && /^\d+\.\d{2}$/.test(amount))) {
    throw new ApiError('El servidor devolvió importes inválidos.')
  }
  return {
    productId: data.productoId, quantity: data.cantidad, subtotal: data.subtotal,
    baseFee: data.tarifaBase, shippingFee: data.tarifaEnvio, total: data.total,
  }
}

export function toTransaction(data: ApiTransaction): TransactionRecord {
  const amounts = toQuote(data)
  if (!Number.isSafeInteger(data.id) || !Number.isSafeInteger(data.clienteId)
    || typeof data.referencia !== 'string'
    || !['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(data.estado)) {
    throw new ApiError('El servidor devolvió una transacción inválida.')
  }
  return {
    id: data.id, reference: data.referencia, customerId: data.clienteId,
    status: data.estado, externalId: data.idTransaccionExterna, ...amounts,
  }
}

export async function quoteTransaction(productId: number, quantity: number): Promise<PurchaseSummary> {
  return toQuote(await apiRequest<ApiQuote>('/transacciones/cotizar', {
    method: 'POST', body: JSON.stringify({ productoId: productId, cantidad: quantity }),
  }))
}

export async function createTransaction(productId: number, customerId: number, quantity: number, key: string): Promise<TransactionRecord> {
  return toTransaction(await apiRequest<ApiTransaction>('/transacciones', {
    method: 'POST', headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ productoId: productId, clienteId: customerId, cantidad: quantity }),
  }))
}

export async function getTransaction(id: number): Promise<TransactionRecord> {
  return toTransaction(await apiRequest<ApiTransaction>(`/transacciones/${id}`))
}
