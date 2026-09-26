import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { NuevaTransaccion, Transaccion } from '../domain/transaccion'
import { TransaccionesPort } from '../domain/transacciones.port'

type TransactionRow = Prisma.transaccionesGetPayload<{ include: { transaccion_items: true } }>

function mapTransaccion(row: TransactionRow): Transaccion {
  return {
    id: row.id,
    referencia: row.referencia,
    productoId: row.producto_id,
    ...(row.transaccion_items?.length ? { items: row.transaccion_items.map((item) => ({
      productoId: item.producto_id, cantidad: item.cantidad,
      precioUnitario: item.precio_unitario.toFixed(2), subtotal: item.subtotal.toFixed(2),
    })) } : {}),
    clienteId: row.cliente_id,
    cantidad: row.cantidad,
    subtotal: row.subtotal.toFixed(2),
    tarifaBase: row.tarifa_base.toFixed(2),
    tarifaEnvio: row.tarifa_envio.toFixed(2),
    total: row.total.toFixed(2),
    estado: row.estado,
    idTransaccionExterna: row.id_transaccion_wompi,
  }
}

@Injectable()
export class PrismaTransaccionesRepository implements TransaccionesPort {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(id: number): Promise<Transaccion | null> {
    const row = await this.prisma.transacciones.findUnique({ where: { id }, include: { transaccion_items: { orderBy: { producto_id: 'asc' } } } })
    return row ? mapTransaccion(row) : null
  }

  async buscarPorReferencia(referencia: string): Promise<Transaccion | null> {
    const row = await this.prisma.transacciones.findUnique({ where: { referencia }, include: { transaccion_items: { orderBy: { producto_id: 'asc' } } } })
    return row ? mapTransaccion(row) : null
  }

  async crear(data: NuevaTransaccion): Promise<Transaccion> {
    const create = {
      referencia: data.referencia,
      producto_id: data.productoId,
      cliente_id: data.clienteId,
      cantidad: data.cantidad,
      subtotal: data.subtotal,
      tarifa_base: data.tarifaBase,
      tarifa_envio: data.tarifaEnvio,
      total: data.total,
      estado: 'PENDIENTE' as const,
      ...(data.items ? { transaccion_items: { create: data.items.map((item) => ({ producto_id: item.productoId,
        cantidad: item.cantidad, precio_unitario: item.precioUnitario, subtotal: item.subtotal })) } } : {}),
    }
    try {
      const row = await this.prisma.transacciones.upsert({ where: { referencia: data.referencia }, create, update: {},
        include: { transaccion_items: { orderBy: { producto_id: 'asc' } } } })
      return mapTransaccion(row)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await this.buscarPorReferencia(data.referencia)
        if (row) return row
      }
      throw error
    }
  }
}
