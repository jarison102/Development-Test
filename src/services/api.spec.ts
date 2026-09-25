import { ApiError, apiRequest } from './api'
import { getProducts } from './productos.service'

jest.mock('./config', () => ({ apiUrl: 'http://localhost:3000/api' }))

const mockFetch = jest.fn()
global.fetch = mockFetch

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('HTTP y catálogo', () => {
  beforeEach(() => mockFetch.mockReset())

  it('convierte el catálogo de la API en productos tipados', async () => {
    mockFetch.mockResolvedValue(response(200, { data: [{
      id: 1, nombre: 'Audífonos Pro', descripcion: 'Producto real', precio: '250000.00',
      stock: 10, imagen: null, activo: true,
    }] }))
    expect(await getProducts()).toEqual([{
      id: 1, name: 'Audífonos Pro', description: 'Producto real',
      price: '250000.00', stock: 10, image: null,
    }])
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/productos', expect.any(Object))
  })

  it.each([400, 404, 409, 500])('devuelve error seguro ante HTTP %i', async (status) => {
    mockFetch.mockResolvedValue(response(status, { error: { message: 'Detalle interno no confiable' } }))
    await expect(apiRequest('/productos')).rejects.toMatchObject({ status })
    await expect(apiRequest('/productos')).rejects.not.toThrow('Detalle interno no confiable')
  })

  it('avisa cuando el servidor está desconectado', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiRequest('/productos')).rejects.toThrow('No se pudo conectar con el backend')
  })

  it('cancela peticiones que superan el tiempo límite', async () => {
    jest.useFakeTimers()
    try {
      mockFetch.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')))
      }))
      const request = apiRequest('/productos')
      const check = expect(request).rejects.toThrow('La solicitud tardó demasiado')
      jest.advanceTimersByTime(10000)
      await check
    } finally {
      jest.useRealTimers()
    }
  })

  it('rechaza respuestas malformadas', async () => {
    mockFetch.mockResolvedValue(response(200, { productos: [] }))
    await expect(apiRequest('/productos')).rejects.toBeInstanceOf(ApiError)
  })
})
