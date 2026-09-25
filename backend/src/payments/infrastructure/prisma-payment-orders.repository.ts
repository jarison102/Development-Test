import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { Transaccion } from '../../transacciones/domain/transaccion'
import { DeliveryDetails, PaymentOrdersPort } from '../ports/payment-orders.port'

@Injectable()
export class PrismaPaymentOrdersRepository implements PaymentOrdersPort {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: number) {
    const row = await this.prisma.transacciones.findUnique({ where: { id }, include: { clientes: true } })
    if (!row) return null
    return { id: row.id, referencia: row.referencia, productoId: row.producto_id, clienteId: row.cliente_id,
      cantidad: row.cantidad, subtotal: row.subtotal.toFixed(2), tarifaBase: row.tarifa_base.toFixed(2),
      tarifaEnvio: row.tarifa_envio.toFixed(2), total: row.total.toFixed(2), estado: row.estado,
      idTransaccionExterna: row.id_transaccion_wompi, email: row.clientes.correo }
  }

  async reserve(id: number, delivery: DeliveryDetails) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.transacciones.findUnique({ where: { id } })
      if (!order) throw new NotFoundException('Transacción no encontrada')
      await tx.$queryRaw`SELECT id FROM productos WHERE id = ${order.producto_id} FOR UPDATE`
      const rows = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM transacciones WHERE id = ${id} FOR UPDATE`
      if (rows[0]?.estado !== 'PENDIENTE') return false
      const existing = await tx.payment_attempts.findUnique({ where: { transaccion_id: id } })
      if (existing) return false
      const product = await tx.productos.findUniqueOrThrow({ where: { id: order.producto_id } })
      const reservations = await tx.payment_attempts.aggregate({ where: { producto_id: order.producto_id, estado: 'ACTIVE' }, _sum: { cantidad: true } })
      if (!product.activo || product.stock - (reservations._sum.cantidad ?? 0) < order.cantidad) {
        throw new ConflictException('Stock insuficiente')
      }
      await tx.payment_attempts.create({ data: { transaccion_id: id, producto_id: order.producto_id,
        cantidad: order.cantidad, estado: 'ACTIVE', direccion: delivery.address, ciudad: delivery.city,
        departamento: delivery.department, codigo_postal: delivery.postalCode || null } })
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
      const order = await tx.transacciones.findUnique({ where: { id } })
      if (!order) throw new NotFoundException('Transacción no encontrada')
      await tx.$queryRaw`SELECT id FROM productos WHERE id = ${order.producto_id} FOR UPDATE`
      const rows = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM transacciones WHERE id = ${id} FOR UPDATE`
      if (rows[0]?.estado !== 'PENDIENTE') return
      const attempt = await tx.payment_attempts.findUnique({ where: { transaccion_id: id } })
      if (!attempt || attempt.estado !== 'ACTIVE' || !order.id_transaccion_wompi) throw new ConflictException('Pago sin confirmación externa')
      if (status === 'APPROVED') {
        const updated = await tx.productos.updateMany({ where: { id: order.producto_id, stock: { gte: order.cantidad } },
          data: { stock: { decrement: order.cantidad } } })
        if (updated.count !== 1) throw new ConflictException('Stock insuficiente: requiere conciliación del pago aprobado')
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
