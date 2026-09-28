import { Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { ClientesPort } from '../../clientes/domain/clientes.port'
import { AppError, unexpected } from '../../common/result/app-error'
import { Result, andThenAsync, combine, err, fromPromise, isErr, ok } from '../../common/result/result'
import { ProductosPort } from '../../productos/domain/productos.port'
import { CotizarTransaccionDto } from '../dto/cotizar-transaccion.dto'
import { CrearTransaccionDto } from '../dto/crear-transaccion.dto'
import { calcularImportes, calcularImportesItems } from '../domain/calcular-importes'
import { NuevaTransaccion, Transaccion } from '../domain/transaccion'
import { TransaccionesPort } from '../domain/transacciones.port'

type Quote = Omit<NuevaTransaccion, 'referencia' | 'clienteId'>

async function cotizar(productos: ProductosPort, data: CotizarTransaccionDto): Promise<Result<Quote, AppError>> {
  if (data.items && (data.productoId !== undefined || data.cantidad !== undefined)) {
    return err({ kind: 'Validation', message: 'Indica items o producto y cantidad' })
  }
  const requested = data.items ?? [{ productoId: data.productoId, cantidad: data.cantidad }]
  if (requested.length < 1 || requested.length > 50 || requested.some((item) =>
    !Number.isSafeInteger(item.productoId) || !Number.isSafeInteger(item.cantidad) || item.productoId! < 1 || item.cantidad! < 1)
    || new Set(requested.map((item) => item.productoId)).size !== requested.length) {
    return err({ kind: 'Validation', message: 'Artículos inválidos o duplicados' })
  }
  const products = await Promise.all(requested.map(async (item): Promise<Result<{ productoId: number; cantidad: number; precioUnitario: string }, AppError>> => {
    const found = await fromPromise(() => productos.buscar(item.productoId!), unexpected)
    if (isErr(found)) return found
    const producto = found.value
    if (!producto || !producto.activo) return err({ kind: 'NotFound', message: 'Producto no encontrado' })
    if (producto.stock < item.cantidad!) return err({ kind: 'StockInsuficiente', message: 'Stock insuficiente' })
    return ok({ productoId: producto.id, cantidad: item.cantidad!, precioUnitario: producto.precio })
  }))
  const combined = combine(products)
  if (isErr(combined)) return combined
  const items = combined.value
  return fromPromise(async (): Promise<Quote> => {
    if (!data.items) return { productoId: items[0].productoId, cantidad: items[0].cantidad,
      ...calcularImportes(items[0].precioUnitario, items[0].cantidad) }
    const ordered = items.sort((a, b) => a.productoId - b.productoId)
    const { subtotals, ...amounts } = calcularImportesItems(ordered.map((item) => ({ precio: item.precioUnitario, cantidad: item.cantidad })))
    return { productoId: ordered[0].productoId, cantidad: ordered[0].cantidad,
      items: ordered.map((item, index) => ({ ...item, subtotal: subtotals[index] })), ...amounts }
  }, (): AppError => ({ kind: 'Conflict', message: 'No se puede calcular el importe de esta compra' }))
}

@Injectable()
export class CotizarTransaccion {
  constructor(private readonly productos: ProductosPort) {}

  execute(data: CotizarTransaccionDto) { return cotizar(this.productos, data) }
}

@Injectable()
export class CrearTransaccion {
  constructor(
    private readonly productos: ProductosPort,
    private readonly clientes: ClientesPort,
    private readonly transacciones: TransaccionesPort,
  ) {}

  async execute(data: CrearTransaccionDto, idempotencyKey?: string): Promise<Result<Transaccion, AppError>> {
    if (idempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return err({ kind: 'Validation', message: 'Idempotency-Key inválida' })
    }
    const referencia = idempotencyKey
      ? createHash('sha256').update(`checkout:${idempotencyKey}`).digest('hex') : randomUUID()
    const previous = idempotencyKey ? await fromPromise(() => this.transacciones.buscarPorReferencia(referencia), unexpected) : ok(null)
    if (isErr(previous)) return previous
    if (previous.value) return this.comprobarReintento(previous.value, data)

    const quote = await cotizar(this.productos, data)
    return andThenAsync(quote, async (importes): Promise<Result<Transaccion, AppError>> => {
      const customer = await fromPromise(() => this.clientes.buscar(data.clienteId), unexpected)
      if (isErr(customer)) return customer
      if (!customer.value) return err({ kind: 'NotFound', message: 'Cliente no encontrado' })
      const created = await fromPromise(() => this.transacciones.crear({ referencia, clienteId: data.clienteId, ...importes }), unexpected)
      return isErr(created) ? created : this.comprobarReintento(created.value, data)
    })
  }

  private comprobarReintento(transaction: Transaccion, data: CrearTransaccionDto): Result<Transaccion, AppError> {
    const expected = data.items?.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad }))
      .sort((a, b) => a.productoId - b.productoId)
    const actual = transaction.items?.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad }))
    if (transaction.clienteId !== data.clienteId || (expected
      ? JSON.stringify(expected) !== JSON.stringify(actual)
      : !!transaction.items || transaction.productoId !== data.productoId || transaction.cantidad !== data.cantidad)) {
      return err({ kind: 'Conflict', message: 'La clave de idempotencia pertenece a otra compra' })
    }
    return ok(transaction)
  }
}

@Injectable()
export class ObtenerTransaccion {
  constructor(private readonly transacciones: TransaccionesPort) {}

  async execute(id: number): Promise<Result<Transaccion, AppError>> {
    const transaction = await fromPromise(() => this.transacciones.buscar(id), unexpected)
    if (isErr(transaction)) return transaction
    if (!transaction.value) return err({ kind: 'NotFound', message: 'Transacción no encontrada' })
    return ok(transaction.value)
  }
}
