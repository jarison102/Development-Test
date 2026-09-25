import { Injectable, NotFoundException } from '@nestjs/common'
import { ProductosPort } from '../domain/productos.port'

@Injectable()
export class ListarProductos {
  constructor(private readonly productos: ProductosPort) {}

  execute() {
    return this.productos.listar()
  }
}

@Injectable()
export class ObtenerProducto {
  constructor(private readonly productos: ProductosPort) {}

  async execute(id: number) {
    const producto = await this.productos.buscar(id)
    if (!producto) throw new NotFoundException('Producto no encontrado')
    return producto
  }
}
