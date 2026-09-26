import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { Transaccion } from '../../transacciones/domain/transaccion'
import { DeliveryDetails, PaymentOrdersPort } from '../ports/payment-orders.port'

type OrderRow = Prisma.transaccionesGetPayload<{ include: { transaccion_items: true } }>

function orderItems(order: OrderRow) {
  return order.transaccion_items?.length ? order.transaccion_items.map((item) => ({ productoId: item.producto_id, cantidad: item.cantidad }))
    : [{ productoId: order.producto_id, cantidad: order.cantidad }]
}

@Injectable()
export class PrismaPaymentOrdersRepository implements PaymentOrdersPort {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: number) {
    const row = await this.prisma.transacciones.findUnique({ where: { id }, include: { clientes: true,
      transaccion_items: { orderBy: { producto_id: 'asc' } } } })
    if (!row) return null
    return { id: row.id, referencia: row.referencia, productoId: row.producto_id, clienteId: row.cliente_id,
      ...(row.transaccion_items?.length ? { items: row.transaccion_items.map((item) => ({
        productoId: item.producto_id, cantidad: item.cantidad,
        precioUnitario: item.precio_unitario.toFixed(2), subtotal: item.subtotal.toFixed(2),
      })) } : {}),
      cantidad: row.cantidad, subtotal: row.subtotal.toFixed(2), tarifaBase: row.tarifa_base.toFixed(2),
      tarifaEnvio: row.tarifa_envio.toFixed(2), total: row.total.toFixed(2), estado: row.estado,
      idTransaccionExterna: row.id_transaccion_wompi, email: row.clientes.correo }
  }

  async reserve(id: number, delivery: DeliveryDetails) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.transacciones.findUnique({ where: { id }, include: { transaccion_items: true } })
      if (!order) throw new NotFoundException('Transacción no encontrada')
      const items = orderItems(order).sort((a, b) => a.productoId - b.productoId)
      for (const item of items) await tx.$queryRaw`SELECT id FROM productos WHERE id = ${item.productoId} FOR UPDATE`
      const rows = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM transacciones WHERE id = ${id} FOR UPDATE`
      if (rows[0]?.estado !== 'PENDIENTE') return false
      const existing = await tx.payment_attempts.findUnique({ where: { transaccion_id: id } })
      if (existing) return false
      for (const item of items) {
        const product = await tx.productos.findUniqueOrThrow({ where: { id: item.productoId } })
        const anchors = await tx.payment_attempts.aggregate({ where: { producto_id: item.productoId, estado: 'ACTIVE' }, _sum: { cantidad: true } })
        const extras = await tx.payment_attempt_items.aggregate({ where: { producto_id: item.productoId,
          payment_attempts: { estado: 'ACTIVE' } }, _sum: { cantidad: true } })
        if (!product.activo || product.stock - (anchors._sum.cantidad ?? 0) - (extras._sum.cantidad ?? 0) < item.cantidad) {
          throw new ConflictException('Stock insuficiente')
        }
      }
      await tx.payment_attempts.create({ data: { transaccion_id: id, producto_id: order.producto_id,
        cantidad: order.cantidad, estado: 'ACTIVE', direccion: delivery.address, ciudad: delivery.city,
        departamento: delivery.department, codigo_postal: delivery.postalCode || null,
        ...(items.length > 1 ? { payment_attempt_items: { create: items.slice(1).map((item) => ({
          producto_id: item.productoId, cantidad: item.cantidad })) } } : {}),
      } })
      return true
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  }

  async attachExternal(id: number, externalId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.transacciones.findUnique({ where: { id } })
      const attempt = await tx.payment_attempts.findUnique({ where: { transaccion_id: id } })
      if (!order || !attempt || attempt.estado !== 'ACTIVE' || order.id_transaccion_wompi && order.id_transaccion_wompi !== externalId) {
        throw new ConflictException('Pago no disponible para actualizar')
      }
      await tx.transacciones.update({ where: { id }, data: { id_transaccion_wompi: externalId } })
    })
  }

  async settle(id: number, status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR'): Promise<Transaccion> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.transacciones.findUnique({ where: { id }, include: { transaccion_items: true } })
      if (!order) throw new NotFoundException('Transacción no encontrada')
      const items = orderItems(order).sort((a, b) => a.productoId - b.productoId)
      for (const item of items) await tx.$queryRaw`SELECT id FROM productos WHERE id = ${item.productoId} FOR UPDATE`
      const rows = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM transacciones WHERE id = ${id} FOR UPDATE`
      if (rows[0]?.estado !== 'PENDIENTE') return
      const attempt = await tx.payment_attempts.findUnique({ where: { transaccion_id: id } })
      if (!attempt || attempt.estado !== 'ACTIVE' || !order.id_transaccion_wompi) throw new ConflictException('Pago sin confirmación externa')
      if (status === 'APPROVED') {
        for (const item of items) {
          const updated = await tx.productos.updateMany({ where: { id: item.productoId, activo: true,
            stock: { gte: item.cantidad } }, data: { stock: { decrement: item.cantidad } } })
          if (updated.count !== 1) throw new ConflictException('Stock insuficiente: requiere conciliación del pago aprobado')
        }
        await tx.entregas.create({ data: { transaccion_id: id, cliente_id: order.cliente_id,
          direccion: attempt.direccion, ciudad: attempt.ciudad, departamento: attempt.departamento,
          codigo_postal: attempt.codigo_postal, estado: 'PENDIENTE' } })
      }
      await tx.transacciones.update({ where: { id }, data: {
        estado: status === 'APPROVED' ? 'APROBADA' : 'RECHAZADA', fecha_actualizacion: new Date(),
      } })
      await tx.payment_attempts.delete({ where: { transaccion_id: id } })
    })
    const result = await this.get(id)
    if (!result) throw new NotFoundException('Transacción no encontrada')
    const { email: _email, ...transaction } = result
    void _email
    return transaction
  }
}
