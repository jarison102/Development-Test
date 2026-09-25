import { Injectable } from '@nestjs/common'
import { productos } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { Producto } from '../domain/producto'
import { ProductosPort } from '../domain/productos.port'

function mapProducto(row: productos): Producto {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    precio: row.precio.toFixed(2),
    stock: row.stock,
    imagen: row.imagen,
    activo: row.activo,
  }
}

@Injectable()
export class PrismaProductosRepository implements ProductosPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<Producto[]> {
    const rows = await this.prisma.productos.findMany({ where: { activo: true }, orderBy: { id: 'asc' } })
    return rows.map(mapProducto)
  }

  async buscar(id: number): Promise<Producto | null> {
    const row = await this.prisma.productos.findFirst({ where: { id, activo: true } })
    return row ? mapProducto(row) : null
  }
}
