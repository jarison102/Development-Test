import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { CrearCliente } from '../../clientes/application/crear-cliente.use-case'
import { ClientesController } from '../../clientes/clientes.controller'
import { CrearEntrega } from '../../entregas/application/crear-entrega.use-case'
import { EntregasController } from '../../entregas/entregas.controller'
import { PaymentsController } from '../../payments/payments.controller'
import { PaymentsUseCases } from '../../payments/application/payments.use-cases'
import { ListarProductos, ObtenerProducto } from '../../productos/application/productos.use-cases'
import { ProductosController } from '../../productos/productos.controller'
import { CotizarTransaccion, CrearTransaccion, ObtenerTransaccion } from '../../transacciones/application/transacciones.use-cases'
import { TransaccionesController } from '../../transacciones/transacciones.controller'
import { ApiExceptionFilter } from './api-exception.filter'

describe('Contratos HTTP sin escritura en MySQL', () => {
  let app: NestFastifyApplication
  const createExecute = jest.fn().mockResolvedValue({ id: 3, estado: 'PENDIENTE' })

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductosController, ClientesController, TransaccionesController, EntregasController, PaymentsController],
      providers: [
        { provide: ListarProductos, useValue: { execute: async () => [{ id: 1, nombre: 'Producto' }] } },
        { provide: ObtenerProducto, useValue: { execute: async () => ({ id: 1, nombre: 'Producto' }) } },
        { provide: CrearCliente, useValue: { execute: async () => ({ id: 2, nombre: 'Cliente' }) } },
        { provide: CotizarTransaccion, useValue: { execute: async () => ({ productoId: 1, cantidad: 1, subtotal: '250000.00', tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '256500.00' }) } },
        { provide: CrearTransaccion, useValue: { execute: createExecute } },
        { provide: ObtenerTransaccion, useValue: { execute: async () => ({ id: 3, estado: 'PENDIENTE' }) } },
        { provide: CrearEntrega, useValue: { execute: async () => ({ id: 4, estado: 'PENDIENTE' }) } },
        { provide: PaymentsUseCases, useValue: { terms: async () => ({ privacy: 'https://e.test/p' }),
          tokenize: async () => ({ token: 'tok_test_mock' }), pay: jest.fn(), check: jest.fn() } },
      ],
    }).compile()
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    app.useGlobalFilters(new ApiExceptionFilter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('devuelve productos en el sobre data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/productos' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [{ id: 1, nombre: 'Producto' }] })
  })

  it('rechaza importes enviados por el cliente', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/transacciones', payload: {
      productoId: 1, clienteId: 2, cantidad: 1, total: 1,
    } })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('BAD_REQUEST')
  })

  it('cotiza sin escribir y responde con 200', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/transacciones/cotizar', payload: {
      productoId: 1, cantidad: 1,
    } })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.total).toBe('256500.00')
  })

  it('registra cliente con 201 y consulta transacción con 200', async () => {
    const cliente = await app.inject({ method: 'POST', url: '/api/clientes', payload: {
      nombre: 'Cliente', correo: 'cliente@example.test', telefono: '3000000000',
    } })
    const transaccion = await app.inject({ method: 'GET', url: '/api/transacciones/3' })
    expect(cliente.statusCode).toBe(201)
    expect(cliente.json().data.id).toBe(2)
    expect(transaccion.statusCode).toBe(200)
    expect(transaccion.json().data.estado).toBe('PENDIENTE')
  })

  it('crea una transacción pendiente con 201 y transmite Idempotency-Key', async () => {
    const key = 'ef3b98af-a0c7-410b-bf32-3f126709aed1'
    const response = await app.inject({ method: 'POST', url: '/api/transacciones', headers: {
      'Idempotency-Key': key,
    }, payload: { productoId: 1, clienteId: 2, cantidad: 1 } })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ data: { id: 3, estado: 'PENDIENTE' } })
    expect(createExecute).toHaveBeenCalledWith(expect.objectContaining({ productoId: 1, clienteId: 2, cantidad: 1 }), key)
  })

  it('acepta un carrito sin importes y rechaza precios o stock del navegador', async () => {
    const items = [{ productoId: 2, cantidad: 1 }, { productoId: 1, cantidad: 2 }]
    const valid = await app.inject({ method: 'POST', url: '/api/transacciones', payload: { clienteId: 2, items } })
    expect(valid.statusCode).toBe(201)
    expect(createExecute).toHaveBeenCalledWith(expect.objectContaining({ items }), undefined)
    for (const badItem of [{ ...items[0], precio: '0.01' }, { ...items[0], stock: 100 }]) {
      const invalid = await app.inject({ method: 'POST', url: '/api/transacciones/cotizar', payload: { items: [badItem] } })
      expect(invalid.statusCode).toBe(400)
    }
    const empty = await app.inject({ method: 'POST', url: '/api/transacciones/cotizar', payload: { items: [] } })
    expect(empty.statusCode).toBe(400)
  })

  it('valida correo y parámetros inválidos', async () => {
    const cliente = await app.inject({ method: 'POST', url: '/api/clientes', payload: {
      nombre: 'Cliente', correo: 'invalido', telefono: '3000000000',
    } })
    const producto = await app.inject({ method: 'GET', url: '/api/productos/no-es-id' })
    expect(cliente.statusCode).toBe(400)
    expect(producto.statusCode).toBe(400)
  })

  it('consulta un producto por id y crea una entrega válida', async () => {
    const producto = await app.inject({ method: 'GET', url: '/api/productos/1' })
    const entrega = await app.inject({ method: 'POST', url: '/api/entregas', payload: {
      transaccionId: 3, clienteId: 2, direccion: 'Calle 1', ciudad: 'Bogotá',
      departamento: 'Cundinamarca', codigoPostal: '110111',
    } })
    expect(producto.statusCode).toBe(200)
    expect(producto.json().data.id).toBe(1)
    expect(entrega.statusCode).toBe(201)
    expect(entrega.json().data.estado).toBe('PENDIENTE')
  })

  it('reexpone la tokenización: devuelve el token y valida el JWE', async () => {
    const okResponse = await app.inject({ method: 'POST', url: '/api/payments/tokenize', payload: {
      payload: 'aaa.bbb.ccc.ddd.eee',
    } })
    const bad = await app.inject({ method: 'POST', url: '/api/payments/tokenize', payload: {
      payload: 'no-es-jwe',
    } })
    const card = await app.inject({ method: 'POST', url: '/api/payments/tokenize', payload: {
      payload: '4242 4242 4242 4242',
    } })
    expect(okResponse.statusCode).toBe(201)
    expect(okResponse.json()).toEqual({ data: { token: 'tok_test_mock' } })
    expect(bad.statusCode).toBe(400)
    expect(card.statusCode).toBe(400)
  })

  it('rechaza una entrega con cuerpo incompleto', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/entregas', payload: {
      transaccionId: 3, clienteId: 2,
    } })
    expect(response.statusCode).toBe(400)
  })
})
