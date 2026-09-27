import { ApiError } from './api'
import { createCustomer } from './clientes.service'
import { checkPayment, getPaymentTerms, payTransaction } from './payments.service'
import { getProduct } from './productos.service'
import { createCartTransaction, createTransaction, getTransaction, quoteCart, quoteTransaction } from './transacciones.service'

jest.mock('./config', () => ({ apiUrl: 'http://localhost:3000/api' }))

const mockFetch = jest.fn()
global.fetch = mockFetch

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => ({ data: body }) })
const apiTransaction = { id: 18, referencia: 'ref-1', productoId: 1, clienteId: 7, cantidad: 2,
  subtotal: '500000.00', tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '506500.00',
  estado: 'PENDIENTE', idTransaccionExterna: null }
const terms = { privacy: 'https://example.test/privacy', personal: 'https://example.test/personal',
  publicKey: 'pub_test_placeholder', sandboxUrl: 'https://sandbox.wompi.co/v1', tokenizationKey: 'pem-placeholder' }
const delivery = { address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca', postalCode: '110111' }

beforeEach(() => mockFetch.mockReset())

describe('clientes.service', () => {
  it('registra el cliente recortando sus campos y devuelve su id', async () => {
    mockFetch.mockResolvedValue(ok({ id: 7 }))
    expect(await createCustomer({ name: '  Ana ', email: ' ana@e.test ', phone: ' 300 ' })).toBe(7)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ nombre: 'Ana', correo: 'ana@e.test', telefono: '300' })
  })

  it.each([{ id: 0 }, { id: -2 }, { id: '7' }, { id: 1.5 }])('rechaza un identificador inválido %o', async (data) => {
    mockFetch.mockResolvedValue(ok(data))
    await expect(createCustomer({ name: 'Ana', email: 'a@e.test', phone: '300' }))
      .rejects.toThrow('No pudimos guardar tus datos')
  })
})

describe('transacciones.service', () => {
  it('cotiza enviando solo producto y cantidad', async () => {
    mockFetch.mockResolvedValue(ok({ productoId: 1, cantidad: 2, subtotal: '500000.00',
      tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '506500.00' }))
    const quote = await quoteTransaction(1, 2)
    expect(quote).toEqual({ productId: 1, quantity: 2, subtotal: '500000.00', baseFee: '1500.00',
      shippingFee: '5000.00', total: '506500.00' })
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/api/transacciones/cotizar')
    expect(JSON.parse(options.body as string)).toEqual({ productoId: 1, cantidad: 2 })
  })

  it('cotiza y crea compra de varios productos transmitiendo solo IDs y cantidades', async () => {
    const items = [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }]
    const apiItems = [{ productoId: 1, cantidad: 2, precioUnitario: '250000.00', subtotal: '500000.00' },
      { productoId: 2, cantidad: 1, precioUnitario: '100.00', subtotal: '100.00' }]
    mockFetch.mockResolvedValueOnce(ok({ ...apiTransaction, cantidad: 2, subtotal: '500100.00',
      total: '506600.00', items: apiItems }))
      .mockResolvedValueOnce(ok({ ...apiTransaction, subtotal: '500100.00', total: '506600.00', items: apiItems }))
    expect((await quoteCart(items)).items).toHaveLength(2)
    const transaction = await createCartTransaction(items, 7, 'key-uuid')
    expect(transaction.items?.[1]).toEqual({ productId: 2, quantity: 1, unitPrice: '100.00', subtotal: '100.00' })
    expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ items: [
      { productoId: 1, cantidad: 2 }, { productoId: 2, cantidad: 1 },
    ] })
    expect(JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      clienteId: 7, items: [{ productoId: 1, cantidad: 2 }, { productoId: 2, cantidad: 1 }],
    })
  })

  it.each([
    ['importe con formato inválido', { ...apiTransaction, total: '506500' }],
    ['estado desconocido', { ...apiTransaction, estado: 'OTRO' }],
    ['identificador fraccionario', { ...apiTransaction, id: 1.5 }],
  ])('rechaza una transacción con %s', async (_caso, data) => {
    mockFetch.mockResolvedValue(ok(data))
    await expect(getTransaction(18)).rejects.toBeInstanceOf(ApiError)
  })

  it('crea y consulta transacciones transmitiendo la clave de idempotencia', async () => {
    mockFetch.mockResolvedValue(ok({ ...apiTransaction, estado: 'APROBADA', idTransaccionExterna: 'sandbox-1' }))
    const created = await createTransaction(1, 7, 2, 'key-uuid')
    expect(created.status).toBe('APROBADA')
    expect(created.externalId).toBe('sandbox-1')
    expect((mockFetch.mock.calls[0][1] as RequestInit).headers)
      .toMatchObject({ 'Idempotency-Key': 'key-uuid' })
    const found = await getTransaction(18)
    expect(found.id).toBe(18)
    expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:3000/api/transacciones/18')
  })
})

describe('payments.service consultas internas', () => {
  it('paga enviando token, cuotas, aceptaciones y entrega; nunca la tarjeta', async () => {
    mockFetch.mockResolvedValue(ok(apiTransaction))
    await payTransaction(18, 'key-uuid', 'tok_test_x', 3, delivery, terms)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(url).toBe('http://localhost:3000/api/payments/18')
    expect(body).toMatchObject({ cardToken: 'tok_test_x', installments: 3, acceptPrivacy: true,
      acceptPersonal: true, privacyDocument: terms.privacy, personalDocument: terms.personal,
      address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca', postalCode: '110111' })
    expect(JSON.stringify(body)).not.toMatch(/number|cvc|holder|month|year/i)
    expect((options.headers as Record<string, string>)['Idempotency-Key']).toBe('key-uuid')
  })

  it('verifica el estado con la clave de la orden y obtiene términos del backend', async () => {
    mockFetch.mockResolvedValueOnce(ok(apiTransaction)).mockResolvedValueOnce(ok(terms))
    await checkPayment(18, 'key-uuid')
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/api/payments/18')
    expect((options.headers as Record<string, string>)['Idempotency-Key']).toBe('key-uuid')
    expect(options.method).toBeUndefined()
    expect(await getPaymentTerms()).toEqual(terms)
  })
})

describe('productos.service', () => {
  it('consulta un producto individual y valida su forma', async () => {
    mockFetch.mockResolvedValue(ok({ id: 1, nombre: 'Audífonos', descripcion: 'Desc',
      precio: '250000.00', stock: 9, imagen: 'https://img.test/x.png', activo: true }))
    const product = await getProduct(1)
    expect(product).toEqual({ id: 1, name: 'Audífonos', description: 'Desc', price: '250000.00',
      stock: 9, image: 'https://img.test/x.png' })
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3000/api/productos/1')
  })

  it.each([
    ['precio malformado', { precio: '250000' }],
    ['stock negativo', { stock: -1 }],
    ['imagen no textual', { imagen: 42 }],
  ])('rechaza un producto con %s', async (_caso, override) => {
    mockFetch.mockResolvedValue(ok({ id: 1, nombre: 'P', descripcion: 'D', precio: '1.00',
      stock: 1, imagen: null, activo: true, ...override }))
    await expect(getProduct(1)).rejects.toThrow('No pudimos mostrar este producto')
  })
})
