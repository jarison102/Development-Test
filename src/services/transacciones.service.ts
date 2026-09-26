import type { CartItem } from '../store/cartSlice'
import type { PurchaseSummary } from '../types/checkout'
import type { TransactionRecord, TransactionStatus } from '../types/transaction'
import { ApiError, apiRequest } from './api'

type ApiQuote = {
  productoId: number
  cantidad: number
  items?: { productoId: number; cantidad: number; precioUnitario: string; subtotal: string }[]
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
  if (data.items !== undefined && (!Array.isArray(data.items) || data.items.length === 0 || !data.items.every((item) =>
    Number.isSafeInteger(item.productoId) && item.productoId > 0 && Number.isSafeInteger(item.cantidad)
    && item.cantidad > 0 && [item.precioUnitario, item.subtotal].every((amount) => typeof amount === 'string' && /^\d+\.\d{2}$/.test(amount))))) {
    throw new ApiError('El servidor devolvió artículos inválidos.')
  }
  return {
    ...(data.items ? { items: data.items.map((item) => ({ productId: item.productoId, quantity: item.cantidad,
      unitPrice: item.precioUnitario, subtotal: item.subtotal })) } : {}),
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

export async function quoteCart(items: Pick<CartItem, 'productId' | 'quantity'>[]): Promise<PurchaseSummary> {
  return toQuote(await apiRequest<ApiQuote>('/transacciones/cotizar', {
    method: 'POST', body: JSON.stringify({ items: items.map((item) => ({ productoId: item.productId, cantidad: item.quantity })) }),
  }))
}

export async function createCartTransaction(items: Pick<CartItem, 'productId' | 'quantity'>[], customerId: number, key: string): Promise<TransactionRecord> {
  return toTransaction(await apiRequest<ApiTransaction>('/transacciones', {
    method: 'POST', headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ items: items.map((item) => ({ productoId: item.productId, cantidad: item.quantity })), clienteId: customerId }),
  }))
}

export async function getTransaction(id: number): Promise<TransactionRecord> {
  return toTransaction(await apiRequest<ApiTransaction>(`/transacciones/${id}`))
}
