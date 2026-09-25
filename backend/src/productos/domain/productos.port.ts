import { Producto } from './producto'

export abstract class ProductosPort {
  abstract listar(): Promise<Producto[]>
  abstract buscar(id: number): Promise<Producto | null>
}
