import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { ClientesPort } from '../../clientes/domain/clientes.port'
import { ProductosPort } from '../../productos/domain/productos.port'
import { CotizarTransaccionDto } from '../dto/cotizar-transaccion.dto'
import { CrearTransaccionDto } from '../dto/crear-transaccion.dto'
import { calcularImportes, calcularImportesItems } from '../domain/calcular-importes'
import { Transaccion } from '../domain/transaccion'
import { TransaccionesPort } from '../domain/transacciones.port'

async function cotizar(productos: ProductosPort, data: CotizarTransaccionDto) {
  if (data.items && (data.productoId !== undefined || data.cantidad !== undefined)) throw new BadRequestException('Indica items o producto y cantidad')
  const requested = data.items ?? [{ productoId: data.productoId, cantidad: data.cantidad }]
  if (requested.length < 1 || requested.length > 50 || requested.some((item) =>
    !Number.isSafeInteger(item.productoId) || !Number.isSafeInteger(item.cantidad) || item.productoId! < 1 || item.cantidad! < 1)
    || new Set(requested.map((item) => item.productoId)).size !== requested.length) throw new BadRequestException('Artículos inválidos o duplicados')
  const items = await Promise.all(requested.map(async (item) => {
    const producto = await productos.buscar(item.productoId!)
    if (!producto || !producto.activo) throw new NotFoundException('Producto no encontrado')
    if (producto.stock < item.cantidad!) throw new ConflictException('Stock insuficiente')
    return { productoId: producto.id, cantidad: item.cantidad!, precioUnitario: producto.precio }
  }))
  try {
    if (!data.items) return { productoId: items[0].productoId, cantidad: items[0].cantidad,
      ...calcularImportes(items[0].precioUnitario, items[0].cantidad) }
    const ordered = items.sort((a, b) => a.productoId - b.productoId)
    const { subtotals, ...amounts } = calcularImportesItems(ordered.map((item) => ({ precio: item.precioUnitario, cantidad: item.cantidad })))
    return { productoId: ordered[0].productoId, cantidad: ordered[0].cantidad,
      items: ordered.map((item, index) => ({ ...item, subtotal: subtotals[index] })), ...amounts }
  } catch {
    throw new ConflictException('No se puede calcular el importe de esta compra')
  }
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

  async execute(data: CrearTransaccionDto, idempotencyKey?: string) {
    if (idempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key inválida')
    }
    const referencia = idempotencyKey
      ? createHash('sha256').update(`checkout:${idempotencyKey}`).digest('hex') : randomUUID()
    const previous = idempotencyKey ? await this.transacciones.buscarPorReferencia(referencia) : null
    if (previous) return this.comprobarReintento(previous, data)

    const importes = await cotizar(this.productos, data)
    if (!await this.clientes.buscar(data.clienteId)) throw new NotFoundException('Cliente no encontrado')
    const created = await this.transacciones.crear({ referencia, clienteId: data.clienteId, ...importes })
    return this.comprobarReintento(created, data)
  }

  private comprobarReintento(transaction: Transaccion, data: CrearTransaccionDto) {
    const expected = data.items?.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad }))
      .sort((a, b) => a.productoId - b.productoId)
    const actual = transaction.items?.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad }))
    if (transaction.clienteId !== data.clienteId || (expected
      ? JSON.stringify(expected) !== JSON.stringify(actual)
      : !!transaction.items || transaction.productoId !== data.productoId || transaction.cantidad !== data.cantidad)) {
      throw new ConflictException('La clave de idempotencia pertenece a otra compra')
    }
    return transaction
  }
}

@Injectable()
export class ObtenerTransaccion {
  constructor(private readonly transacciones: TransaccionesPort) {}

  async execute(id: number) {
    const transaccion = await this.transacciones.buscar(id)
    if (!transaccion) throw new NotFoundException('Transacción no encontrada')
    return transaccion
  }
}
