import { NuevaTransaccion, Transaccion } from './transaccion'

export abstract class TransaccionesPort {
  abstract buscar(id: number): Promise<Transaccion | null>
  abstract buscarPorReferencia(referencia: string): Promise<Transaccion | null>
  abstract crear(data: NuevaTransaccion): Promise<Transaccion>
}
