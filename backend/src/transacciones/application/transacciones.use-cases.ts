import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { ClientesPort } from '../../clientes/domain/clientes.port'
import { ProductosPort } from '../../productos/domain/productos.port'
import { CotizarTransaccionDto } from '../dto/cotizar-transaccion.dto'
import { CrearTransaccionDto } from '../dto/crear-transaccion.dto'
import { calcularImportes } from '../domain/calcular-importes'
import { Transaccion } from '../domain/transaccion'
import { TransaccionesPort } from '../domain/transacciones.port'

async function cotizar(productos: ProductosPort, data: CotizarTransaccionDto) {
  const producto = await productos.buscar(data.productoId)
  if (!producto) throw new NotFoundException('Producto no encontrado')
  if (producto.stock < data.cantidad) throw new ConflictException('Stock insuficiente')
  try {
    return { productoId: producto.id, cantidad: data.cantidad, ...calcularImportes(producto.precio, data.cantidad) }
  } catch {
    throw new ConflictException('No se puede calcular el importe de esta compra')
  }
}

@Injectable()
export class CotizarTransaccion {
  constructor(private readonly productos: ProductosPort) {}

  execute(data: CotizarTransaccionDto) {
    return cotizar(this.productos, data)
  }
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
    if (transaction.productoId !== data.productoId || transaction.clienteId !== data.clienteId
      || transaction.cantidad !== data.cantidad) {
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
