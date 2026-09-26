import { PrismaService } from '../../database/prisma.service'
import { PrismaTransaccionesRepository } from './prisma-transacciones.repository'

const money = (value: string) => ({ toFixed: () => value })
const row = { id: 8, referencia: 'reference', producto_id: 1, cliente_id: 2, cantidad: 2,
  subtotal: money('220.00'), tarifa_base: money('1500.00'), tarifa_envio: money('5000.00'),
  total: money('6720.00'), estado: 'PENDIENTE', id_transaccion_wompi: null,
  transaccion_items: [{ producto_id: 1, cantidad: 2, precio_unitario: money('100.00'), subtotal: money('200.00') },
    { producto_id: 2, cantidad: 1, precio_unitario: money('20.00'), subtotal: money('20.00') }] }

function setup(value: object | null = row) {
  const upsert = jest.fn().mockResolvedValue(value)
  const findUnique = jest.fn().mockResolvedValue(value)
  const repo = new PrismaTransaccionesRepository({ transacciones: { upsert, findUnique } } as unknown as PrismaService)
  return { repo, upsert, findUnique }
}

test('crea orden con snapshots históricos de precio en el mismo upsert idempotente', async () => {
  const { repo, upsert } = setup()
  const result = await repo.crear({ referencia: 'reference', clienteId: 2, productoId: 1, cantidad: 2,
    subtotal: '220.00', tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '6720.00',
    items: [{ productoId: 1, cantidad: 2, precioUnitario: '100.00', subtotal: '200.00' },
      { productoId: 2, cantidad: 1, precioUnitario: '20.00', subtotal: '20.00' }] })
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
    create: expect.objectContaining({ transaccion_items: { create: [
      { producto_id: 1, cantidad: 2, precio_unitario: '100.00', subtotal: '200.00' },
      { producto_id: 2, cantidad: 1, precio_unitario: '20.00', subtotal: '20.00' },
    ] } }), update: {},
  }))
  expect(result.items).toEqual([{ productoId: 1, cantidad: 2, precioUnitario: '100.00', subtotal: '200.00' },
    { productoId: 2, cantidad: 1, precioUnitario: '20.00', subtotal: '20.00' }])
})

test('órdenes históricas sin detalles conservan contrato de un producto', async () => {
  const { repo } = setup({ ...row, transaccion_items: [] })
  expect(await repo.buscar(8)).not.toHaveProperty('items')
  expect((await repo.buscarPorReferencia('reference'))?.productoId).toBe(1)
  expect(await setup(null).repo.buscar(9)).toBeNull()
})
