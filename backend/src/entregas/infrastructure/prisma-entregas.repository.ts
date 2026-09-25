import { Injectable } from '@nestjs/common'
import { entregas } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { Entrega, NuevaEntrega } from '../domain/entrega'
import { EntregasPort } from '../domain/entregas.port'

function mapEntrega(row: entregas): Entrega {
  return {
    id: row.id,
    transaccionId: row.transaccion_id,
    clienteId: row.cliente_id,
    direccion: row.direccion,
    ciudad: row.ciudad,
    departamento: row.departamento,
    codigoPostal: row.codigo_postal,
    estado: row.estado,
  }
}

@Injectable()
export class PrismaEntregasRepository implements EntregasPort {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorTransaccion(id: number): Promise<Entrega | null> {
    const row = await this.prisma.entregas.findFirst({ where: { transaccion_id: id } })
    return row ? mapEntrega(row) : null
  }

  async crearSiAprobadaYUnica(data: NuevaEntrega): Promise<Entrega | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ estado: string }[]>`
        SELECT estado FROM transacciones WHERE id = ${data.transaccionId} FOR UPDATE
      `
      if (rows[0]?.estado !== 'APROBADA') return null
      const existing = await tx.entregas.findFirst({ where: { transaccion_id: data.transaccionId } })
      if (existing) return null
      const row = await tx.entregas.create({ data: {
        transaccion_id: data.transaccionId,
        cliente_id: data.clienteId,
        direccion: data.direccion,
        ciudad: data.ciudad,
        departamento: data.departamento,
        codigo_postal: data.codigoPostal,
        estado: 'PENDIENTE',
      } })
      return mapEntrega(row)
    })
  }
}
