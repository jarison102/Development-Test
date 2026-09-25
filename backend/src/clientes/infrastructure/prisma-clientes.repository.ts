import { Injectable } from '@nestjs/common'
import { clientes } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { Cliente, NuevoCliente } from '../domain/cliente'
import { ClientesPort } from '../domain/clientes.port'

function mapCliente(row: clientes): Cliente {
  return { id: row.id, nombre: row.nombre, correo: row.correo, telefono: row.telefono }
}

@Injectable()
export class PrismaClientesRepository implements ClientesPort {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(id: number): Promise<Cliente | null> {
    const row = await this.prisma.clientes.findUnique({ where: { id } })
    return row ? mapCliente(row) : null
  }

  async crear(data: NuevoCliente): Promise<Cliente> {
    const row = await this.prisma.clientes.create({ data })
    return mapCliente(row)
  }
}
