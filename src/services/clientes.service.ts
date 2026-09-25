import type { Customer } from '../types/checkout'
import { ApiError, apiRequest } from './api'

export async function createCustomer(customer: Customer): Promise<number> {
  const result = await apiRequest<{ id: number }>('/clientes', {
    method: 'POST',
    body: JSON.stringify({
      nombre: customer.name.trim(), correo: customer.email.trim(), telefono: customer.phone.trim(),
    }),
  })
  if (!Number.isSafeInteger(result.id) || result.id < 1) throw new ApiError('El servidor devolvió un cliente inválido.')
  return result.id
}
