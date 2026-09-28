import { Injectable } from '@nestjs/common'
import { AppError, unexpected } from '../../common/result/app-error'
import { err, fromPromise, isErr, ok } from '../../common/result/result'
import { ProductosPort } from '../domain/productos.port'

@Injectable()
export class ListarProductos {
  constructor(private readonly productos: ProductosPort) {}

  execute() {
    return fromPromise(() => this.productos.listar(), unexpected)
  }
}

@Injectable()
export class ObtenerProducto {
  constructor(private readonly productos: ProductosPort) {}

  async execute(id: number) {
    const result = await fromPromise(() => this.productos.buscar(id), unexpected)
    if (isErr(result)) return result
    if (!result.value) return err<AppError>({ kind: 'NotFound', message: 'Producto no encontrado' })
    return ok(result.value)
  }
}
