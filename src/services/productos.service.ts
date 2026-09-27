import type { Product } from '../types/product'
import { ApiError, apiRequest } from './api'

type ApiProduct = {
  id: number
  nombre: string
  descripcion: string
  precio: string
  stock: number
  imagen: string | null
  activo: boolean
}

function toProduct(value: ApiProduct): Product {
  if (!Number.isSafeInteger(value.id) || typeof value.nombre !== 'string'
    || typeof value.descripcion !== 'string' || typeof value.precio !== 'string'
    || !/^\d+\.\d{2}$/.test(value.precio) || !Number.isSafeInteger(value.stock)
    || value.stock < 0 || (value.imagen !== null && typeof value.imagen !== 'string')) {
    throw new ApiError('No pudimos mostrar este producto. Intenta de nuevo.')
  }
  return {
    id: value.id, name: value.nombre, description: value.descripcion,
    price: value.precio, stock: value.stock, image: value.imagen,
  }
}

export async function getProducts(): Promise<Product[]> {
  const items = await apiRequest<ApiProduct[]>('/productos')
  if (!Array.isArray(items)) throw new ApiError('No pudimos mostrar los productos. Intenta de nuevo.')
  return items.map(toProduct)
}

export async function getProduct(id: number): Promise<Product> {
  return toProduct(await apiRequest<ApiProduct>(`/productos/${id}`))
}
