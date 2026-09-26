import { PrismaService } from '../../database/prisma.service'
import { PrismaPaymentOrdersRepository } from './prisma-payment-orders.repository'

const order = { id: 3, producto_id: 1, cliente_id: 2, cantidad: 1,
  estado: 'PENDIENTE', id_transaccion_wompi: 'sandbox-1' }
const delivery = { address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca' }

function setup(stock = 1) {
  const attempts = new Map<number, { estado: string; cantidad: number; direccion: string;
    ciudad: string; departamento: string; codigo_postal: string | null }>()
  let currentStock = stock
  let currentStatus = 'PENDIENTE'
  let createdDeliveries = 0
  const tx = {
    $queryRaw: jest.fn().mockImplementation(async () => [{ estado: currentStatus }]),
    transacciones: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockImplementation(async ({ data }) => { currentStatus = data.estado }) },
    productos: { findUniqueOrThrow: jest.fn().mockImplementation(async () => ({ stock: currentStock, activo: true })),
      updateMany: jest.fn().mockImplementation(async ({ where }) => {
        if (currentStock < where.stock.gte) return { count: 0 }
        currentStock -= where.stock.gte
        return { count: 1 }
      }) },
    payment_attempts: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => attempts.get(where.transaccion_id) ?? null),
      aggregate: jest.fn().mockImplementation(async () => ({ _sum: { cantidad: [...attempts.values()]
        .filter((item) => item.estado === 'ACTIVE').reduce((sum, item) => sum + item.cantidad, 0) } })),
      create: jest.fn().mockImplementation(async ({ data }) => { attempts.set(data.transaccion_id, data) }),
      delete: jest.fn().mockImplementation(async ({ where }) => { attempts.delete(where.transaccion_id) }),
    },
    payment_attempt_items: { aggregate: jest.fn().mockResolvedValue({ _sum: { cantidad: 0 } }) },
    entregas: { create: jest.fn().mockImplementation(async () => { createdDeliveries++ }) },
  }
  let queue = Promise.resolve()
  const prisma = { $transaction: jest.fn().mockImplementation(async (callback) => {
    const next = queue.then(() => callback(tx))
    queue = next.then(() => undefined, () => undefined)
    return next
  }), transacciones: { findUnique: jest.fn().mockResolvedValue({ ...order, referencia: 'order-1',
    subtotal: { toFixed: () => '100.00' }, tarifa_base: { toFixed: () => '0.00' },
    tarifa_envio: { toFixed: () => '0.00' }, total: { toFixed: () => '100.00' },
    clientes: { correo: 'customer@example.test' }, estado: 'PENDIENTE' }) } } as unknown as PrismaService
  return { repo: new PrismaPaymentOrdersRepository(prisma), prisma, tx, attempts,
    stock: () => currentStock, deliveries: () => createdDeliveries }
}

test('reserva concurrente no permite cobrar dos pedidos con stock 1', async () => {
  const { repo, prisma, tx, stock } = setup()
  const results = await Promise.allSettled([repo.reserve(3, delivery), repo.reserve(4, delivery)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(tx.payment_attempts.create).toHaveBeenCalledTimes(1)
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'ReadCommitted' })
  expect(stock()).toBe(1)
})

test('aprobación descuenta una vez y crea solo una entrega', async () => {
  const { repo, stock, deliveries } = setup()
  await repo.reserve(3, delivery)
  await repo.settle(3, 'APPROVED')
  await repo.settle(3, 'APPROVED')
  expect(stock()).toBe(0)
  expect(deliveries()).toBe(1)
})

test.each(['DECLINED', 'ERROR', 'VOIDED'] as const)('%s no descuenta ni entrega', async (status) => {
  const { repo, stock, deliveries } = setup()
  await repo.reserve(3, delivery)
  await repo.settle(3, status)
  expect(stock()).toBe(1)
  expect(deliveries()).toBe(0)
})

function setupControl(overrides: {
  order?: object | null
  txOrder?: object | null
  txEstado?: string
  attempt?: object | null
  product?: { stock: number; activo: boolean }
  updateCount?: number
} = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ estado: overrides.txEstado ?? 'PENDIENTE' }]),
    transacciones: {
      findUnique: jest.fn().mockResolvedValue(overrides.txOrder === undefined ? order : overrides.txOrder),
      update: jest.fn().mockResolvedValue(order),
    },
    productos: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(overrides.product ?? { stock: 5, activo: true }),
      updateMany: jest.fn().mockResolvedValue({ count: overrides.updateCount ?? 1 }),
    },
    payment_attempts: {
      findUnique: jest.fn().mockResolvedValue(overrides.attempt === undefined
        ? { estado: 'ACTIVE', cantidad: 1, direccion: 'C', ciudad: 'B', departamento: 'D', codigo_postal: null }
        : overrides.attempt),
      aggregate: jest.fn().mockResolvedValue({ _sum: { cantidad: 0 } }),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    payment_attempt_items: { aggregate: jest.fn().mockResolvedValue({ _sum: { cantidad: 0 } }) },
    entregas: { create: jest.fn().mockResolvedValue({}) },
  }
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx)),
    transacciones: { findUnique: jest.fn().mockResolvedValue(overrides.order === undefined
      ? { ...order, referencia: 'ref', subtotal: { toFixed: () => '1.00' }, tarifa_base: { toFixed: () => '0.00' },
        tarifa_envio: { toFixed: () => '0.00' }, total: { toFixed: () => '1.00' },
        clientes: { correo: 'c@e.test' } }
      : overrides.order) },
  } as unknown as PrismaService
  return { repo: new PrismaPaymentOrdersRepository(prisma), tx }
}

test('get devuelve null cuando la transacción no existe', async () => {
  const { repo } = setupControl({ order: null })
  expect(await repo.get(99)).toBeNull()
})

test('reserve falla cuando la orden no existe o ya no está pendiente', async () => {
  const { repo } = setupControl({ txOrder: null })
  await expect(repo.reserve(3, delivery)).rejects.toMatchObject({ status: 404 })

  const pending = setupControl({ txEstado: 'APROBADA' })
  expect(await pending.repo.reserve(3, delivery)).toBe(false)
  expect(pending.tx.payment_attempts.create).not.toHaveBeenCalled()

  const duplicated = setupControl({ attempt: { estado: 'ACTIVE', cantidad: 1 } })
  expect(await duplicated.repo.reserve(3, delivery)).toBe(false)
  expect(duplicated.tx.payment_attempts.create).not.toHaveBeenCalled()
})

test('reserve rechaza producto inactivo o sin disponibilidad suficiente', async () => {
  const inactive = setupControl({ attempt: null, product: { stock: 5, activo: false } })
  await expect(inactive.repo.reserve(3, delivery)).rejects.toMatchObject({ status: 409 })

  const shortage = setupControl({ attempt: null, product: { stock: 0, activo: true } })
  await expect(shortage.repo.reserve(3, delivery)).rejects.toMatchObject({ status: 409 })
  expect(shortage.tx.payment_attempts.create).not.toHaveBeenCalled()
})

test('attachExternal guarda el identificador solo con reserva activa consistente', async () => {
  const { repo, tx } = setupControl({ txOrder: { ...order, id_transaccion_wompi: null } })
  await repo.attachExternal(3, 'sandbox-9')
  expect(tx.transacciones.update).toHaveBeenCalledWith({ where: { id: 3 },
    data: { id_transaccion_wompi: 'sandbox-9' } })

  const mismatched = setupControl({ txOrder: { ...order, id_transaccion_wompi: 'otro' } })
  await expect(mismatched.repo.attachExternal(3, 'sandbox-9')).rejects.toMatchObject({ status: 409 })

  const noAttempt = setupControl({ attempt: null })
  await expect(noAttempt.repo.attachExternal(3, 'sandbox-9')).rejects.toMatchObject({ status: 409 })
})

test('settle sin reserva activa o sin id externo es un conflicto, no un descuento', async () => {
  const noAttempt = setupControl({ attempt: null })
  await expect(noAttempt.repo.settle(3, 'APPROVED')).rejects.toMatchObject({ status: 409 })
  expect(noAttempt.tx.productos.updateMany).not.toHaveBeenCalled()

  const noExternal = setupControl({ txOrder: { ...order, id_transaccion_wompi: null } })
  await expect(noExternal.repo.settle(3, 'APPROVED')).rejects.toMatchObject({ status: 409 })
})

test('settle aprobado con stock agotado exige conciliación sin marcar la orden', async () => {
  const { repo, tx } = setupControl({ updateCount: 0 })
  await expect(repo.settle(3, 'APPROVED')).rejects.toMatchObject({ status: 409 })
  expect(tx.entregas.create).not.toHaveBeenCalled()
  expect(tx.transacciones.update).not.toHaveBeenCalled()
  expect(tx.payment_attempts.delete).not.toHaveBeenCalled()
})

test('settle fuera de PENDIENTE no repite el cierre', async () => {
  const { repo, tx } = setupControl({ txEstado: 'APROBADA' })
  await repo.settle(3, 'APPROVED')
  expect(tx.productos.updateMany).not.toHaveBeenCalled()
  expect(tx.entregas.create).not.toHaveBeenCalled()
  expect(tx.payment_attempts.delete).not.toHaveBeenCalled()
})

function setupMulti(stock = [5, 3]) {
  const amounts = new Map([[1, stock[0]], [2, stock[1]]])
  const attempts = new Map<number, { estado: string; cantidad: number; direccion: string; ciudad: string; departamento: string; codigo_postal: null }>()
  const extras = new Map<number, { producto_id: number; cantidad: number }[]>()
  const states = new Map([[3, 'PENDIENTE'], [4, 'PENDIENTE']])
  let deliveries = 0
  const items = [{ producto_id: 1, cantidad: 2, precio_unitario: { toFixed: () => '50.00' }, subtotal: { toFixed: () => '100.00' } },
    { producto_id: 2, cantidad: 1, precio_unitario: { toFixed: () => '100.00' }, subtotal: { toFixed: () => '100.00' } }]
  const getOrder = (id: number) => ({ ...order, id, cantidad: 2, id_transaccion_wompi: `sandbox-${id}`,
    referencia: `order-${id}`, transaccion_items: items, subtotal: { toFixed: () => '200.00' },
    tarifa_base: { toFixed: () => '1500.00' }, tarifa_envio: { toFixed: () => '5000.00' },
    total: { toFixed: () => '6700.00' }, clientes: { correo: 'buyer@example.test' }, estado: states.get(id) })
  const tx = {
    $queryRaw: jest.fn().mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('estado')
      ? [{ estado: states.get(3) ?? 'PENDIENTE' }] : [{ id: 1 }]),
    transacciones: { findUnique: jest.fn().mockImplementation(async ({ where }) => getOrder(where.id)),
      update: jest.fn().mockImplementation(async ({ where, data }) => { states.set(where.id, data.estado) }) },
    productos: { findUniqueOrThrow: jest.fn().mockImplementation(async ({ where }) => ({ stock: amounts.get(where.id), activo: true })),
      updateMany: jest.fn().mockImplementation(async ({ where }) => {
        const current = amounts.get(where.id) ?? 0
        if (current < where.stock.gte) return { count: 0 }
        amounts.set(where.id, current - where.stock.gte)
        return { count: 1 }
      }) },
    payment_attempts: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => attempts.get(where.transaccion_id) ?? null),
      aggregate: jest.fn().mockImplementation(async ({ where }) => ({ _sum: { cantidad: [...attempts.values()]
        .filter((attempt) => attempt.estado === 'ACTIVE' && where.producto_id === 1)
        .reduce((sum, attempt) => sum + attempt.cantidad, 0) } })),
      create: jest.fn().mockImplementation(async ({ data }) => {
        attempts.set(data.transaccion_id, data)
        extras.set(data.transaccion_id, data.payment_attempt_items?.create ?? [])
      }),
      delete: jest.fn().mockImplementation(async ({ where }) => { attempts.delete(where.transaccion_id); extras.delete(where.transaccion_id) }),
    },
    payment_attempt_items: { aggregate: jest.fn().mockImplementation(async ({ where }) => ({ _sum: { cantidad:
      [...extras.values()].flat().filter((item) => item.producto_id === where.producto_id).reduce((sum, item) => sum + item.cantidad, 0) } })) },
    entregas: { create: jest.fn().mockImplementation(async () => { deliveries++ }) },
  }
  let queue = Promise.resolve()
  const prisma = { $transaction: jest.fn().mockImplementation(async (callback) => {
    const next = queue.then(async () => {
      const previous = new Map(amounts)
      try { return await callback(tx) } catch (error) { amounts.clear(); previous.forEach((value, key) => amounts.set(key, value)); throw error }
    })
    queue = next.then(() => undefined, () => undefined)
    return next
  }), transacciones: { findUnique: jest.fn().mockImplementation(async ({ where }) => getOrder(where.id)) } } as unknown as PrismaService
  return { repo: new PrismaPaymentOrdersRepository(prisma), tx, amounts, attempts, extras, deliveries: () => deliveries }
}

test('carrito reserva todas las unidades sin descontar stock y evita competencia por producto secundario', async () => {
  const { repo, tx, amounts, extras } = setupMulti([5, 1])
  const results = await Promise.allSettled([repo.reserve(3, delivery), repo.reserve(4, delivery)])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(extras.size).toBe(1)
  expect(amounts.get(1)).toBe(5)
  expect(amounts.get(2)).toBe(1)
  expect(tx.$queryRaw).toHaveBeenCalled()
})

test('APPROVED de carrito descuenta cada producto una vez y crea una entrega; PENDING no liquida', async () => {
  const { repo, amounts, deliveries } = setupMulti()
  await repo.reserve(3, delivery)
  expect(amounts.get(1)).toBe(5)
  expect(amounts.get(2)).toBe(3)
  expect(deliveries()).toBe(0)
  await repo.settle(3, 'APPROVED')
  await repo.settle(3, 'APPROVED')
  expect(amounts.get(1)).toBe(3)
  expect(amounts.get(2)).toBe(2)
  expect(deliveries()).toBe(1)
})

test.each(['DECLINED', 'VOIDED', 'ERROR'] as const)('carrito %s no toca stock ni entrega', async (status) => {
  const { repo, amounts, deliveries } = setupMulti()
  await repo.reserve(3, delivery)
  await repo.settle(3, status)
  expect([...amounts.values()]).toEqual([5, 3])
  expect(deliveries()).toBe(0)
})

test('agotamiento del segundo artículo revierte el descuento del primero y no crea entrega', async () => {
  const { repo, amounts, tx, deliveries } = setupMulti()
  await repo.reserve(3, delivery)
  amounts.set(2, 0)
  await expect(repo.settle(3, 'APPROVED')).rejects.toMatchObject({ status: 409 })
  expect(amounts.get(1)).toBe(5)
  expect(deliveries()).toBe(0)
  expect(tx.payment_attempts.delete).not.toHaveBeenCalled()
})
