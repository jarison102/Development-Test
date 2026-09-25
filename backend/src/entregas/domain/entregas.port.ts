import { Entrega, NuevaEntrega } from './entrega'

export abstract class EntregasPort {
  abstract buscarPorTransaccion(id: number): Promise<Entrega | null>
  abstract crearSiAprobadaYUnica(data: NuevaEntrega): Promise<Entrega | null>
}
