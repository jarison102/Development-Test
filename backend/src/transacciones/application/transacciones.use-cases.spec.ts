import { ClientesPort } from '../../clientes/domain/clientes.port'
import { ProductosPort } from '../../productos/domain/productos.port'
import { TransaccionesPort } from '../domain/transacciones.port'
import { CotizarTransaccion, CrearTransaccion } from './transacciones.use-cases'

const producto = { id: 1, nombre: 'Producto', descripcion: '', precio: '250000.00', stock: 3, imagen: null, activo: true }
const cliente = { id: 2, nombre: 'Cliente', correo: 'cliente@example.test', telefono: '3000000000' }

function setup() {
  const buscarProducto = jest.fn().mockResolvedValue(producto)
  const buscarCliente = jest.fn().mockResolvedValue(cliente)
  const crear = jest.fn().mockImplementation(async (data) => ({ id: 4, estado: 'PENDIENTE', ...data }))
  const productos: ProductosPort = { listar: jest.fn(), buscar: buscarProducto }
  const clientes: ClientesPort = { buscar: buscarCliente, crear: jest.fn() }
  const buscarPorReferencia = jest.fn().mockResolvedValue(null)
  const transacciones: TransaccionesPort = { buscar: jest.fn(), buscarPorReferencia, crear }
  return { useCase: new CrearTransaccion(productos, clientes, transacciones), cotizar: new CotizarTransaccion(productos), buscarProducto, buscarCliente, crear }
}

describe('CrearTransaccion', () => {
  const input = { productoId: 1, clienteId: 2, cantidad: 2 }

  it('cotiza con importes autoritativos sin crear transacción', async () => {
    const { cotizar, crear } = setup()
    expect(await cotizar.execute({ productoId: 1, cantidad: 2 })).toEqual({
      productoId: 1, cantidad: 2, subtotal: '500000.00',
      tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '506500.00',
    })
    expect(crear).not.toHaveBeenCalled()
  })

  it('genera referencia, calcula importes y deja PENDIENTE sin mutar stock', async () => {
    const { useCase, crear } = setup()
    const result = await useCase.execute(input)
    expect(result.estado).toBe('PENDIENTE')
    expect(result.total).toBe('506500.00')
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({
      cantidad: 2, subtotal: '500000.00', tarifaBase: '1500.00', tarifaEnvio: '5000.00',
      referencia: expect.any(String),
    }))
  })

  it('devuelve la misma transacción al reintentar con la misma clave', async () => {
    const { useCase, crear, buscarProducto } = setup()
    const key = 'ef3b98af-a0c7-410b-bf32-3f126709aed1'
    const first = await useCase.execute(input, key)
    const existing = jest.fn().mockResolvedValue(first)
    const productos: ProductosPort = { listar: jest.fn(), buscar: buscarProducto }
    const clientes: ClientesPort = { buscar: jest.fn(), crear: jest.fn() }
    const transacciones: TransaccionesPort = { buscar: jest.fn(), buscarPorReferencia: existing, crear }
    const replay = await new CrearTransaccion(productos, clientes, transacciones).execute(input, key)
    expect(replay.id).toBe(first.id)
    expect(crear).toHaveBeenCalledTimes(1)
  })

  it('rechaza reutilizar una clave con otra cantidad', async () => {
    const { useCase, crear, buscarProducto } = setup()
    const key = 'ef3b98af-a0c7-410b-bf32-3f126709aed1'
    const first = await useCase.execute(input, key)
    const productos: ProductosPort = { listar: jest.fn(), buscar: buscarProducto }
    const clientes: ClientesPort = { buscar: jest.fn(), crear: jest.fn() }
    const transacciones: TransaccionesPort = {
      buscar: jest.fn(), buscarPorReferencia: jest.fn().mockResolvedValue(first), crear,
    }
    await expect(new CrearTransaccion(productos, clientes, transacciones)
      .execute({ ...input, cantidad: 3 }, key)).rejects.toMatchObject({ status: 409 })
    expect(crear).toHaveBeenCalledTimes(1)
  })

  it('rechaza clave de idempotencia malformada', async () => {
    const { useCase, crear } = setup()
    await expect(useCase.execute(input, 'invalida')).rejects.toMatchObject({ status: 400 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza un producto inexistente', async () => {
    const { useCase, buscarProducto, crear } = setup()
    buscarProducto.mockResolvedValue(null)
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 404 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza un cliente inexistente', async () => {
    const { useCase, buscarCliente, crear } = setup()
    buscarCliente.mockResolvedValue(null)
    await expect(useCase.execute(input)).rejects.toMatchObject({ status: 404 })
    expect(crear).not.toHaveBeenCalled()
  })

  it('cotiza y crea múltiples artículos con precio histórico del backend y una sola tarifa', async () => {
    const { useCase, cotizar, buscarProducto, crear } = setup()
    buscarProducto.mockImplementation(async (id) => id === 1 ? producto : { ...producto, id: 2, precio: '100.25', stock: 5 })
    const items = [{ productoId: 2, cantidad: 1 }, { productoId: 1, cantidad: 2 }]
    const quote = await cotizar.execute({ items })
    expect(quote).toMatchObject({ subtotal: '500100.25', tarifaBase: '1500.00', tarifaEnvio: '5000.00',
      total: '506600.25', items: [
        { productoId: 1, precioUnitario: '250000.00', cantidad: 2, subtotal: '500000.00' },
        { productoId: 2, precioUnitario: '100.25', cantidad: 1, subtotal: '100.25' },
      ] })
    const result = await useCase.execute({ clienteId: 2, items })
    expect(result.estado).toBe('PENDIENTE')
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ productoId: 2, precioUnitario: '100.25' })]), total: '506600.25' }))
  })

  it('reintenta carritos equivalentes sin duplicar y rechaza carrito diferente', async () => {
    const { useCase, buscarProducto, crear } = setup()
    buscarProducto.mockImplementation(async (id) => ({ ...producto, id }))
    const key = 'ef3b98af-a0c7-410b-bf32-3f126709aed1'
    const items = [{ productoId: 2, cantidad: 1 }, { productoId: 1, cantidad: 2 }]
    const first = await useCase.execute({ clienteId: 2, items }, key)
    const port: TransaccionesPort = { buscar: jest.fn(), buscarPorReferencia: jest.fn().mockResolvedValue(first), crear }
    const retry = new CrearTransaccion({ listar: jest.fn(), buscar: buscarProducto },
      { buscar: jest.fn(), crear: jest.fn() }, port)
    expect((await retry.execute({ clienteId: 2, items: [...items].reverse() }, key)).id).toBe(first.id)
    await expect(retry.execute({ clienteId: 2, items: [{ productoId: 1, cantidad: 1 }] }, key)).rejects.toMatchObject({ status: 409 })
    expect(crear).toHaveBeenCalledTimes(1)
  })

  it('rechaza artículos duplicados, inexistentes, inválidos, inactivos y stock insuficiente', async () => {
    const { cotizar, buscarProducto } = setup()
    await expect(cotizar.execute({ items: [{ productoId: 1, cantidad: 1 }, { productoId: 1, cantidad: 1 }] })).rejects.toMatchObject({ status: 400 })
    await expect(cotizar.execute({ items: [{ productoId: 1, cantidad: 0 }] })).rejects.toMatchObject({ status: 400 })
    await expect(cotizar.execute({ items: [{ productoId: 1, cantidad: 4 }] })).rejects.toMatchObject({ status: 409 })
    buscarProducto.mockResolvedValueOnce(null)
    await expect(cotizar.execute({ items: [{ productoId: 2, cantidad: 1 }] })).rejects.toMatchObject({ status: 404 })
    buscarProducto.mockResolvedValueOnce({ ...producto, activo: false })
    await expect(cotizar.execute({ items: [{ productoId: 1, cantidad: 1 }] })).rejects.toMatchObject({ status: 404 })
  })

  it('rechaza stock insuficiente sin crear transacción', async () => {
    const { useCase, crear } = setup()
    await expect(useCase.execute({ ...input, cantidad: 4 })).rejects.toMatchObject({ status: 409 })
    expect(crear).not.toHaveBeenCalled()
  })
})
