import { Transaccion } from '../../transacciones/domain/transaccion'

export type DeliveryDetails = { address: string; city: string; department: string; postalCode?: string }

export abstract class PaymentOrdersPort {
  abstract get(id: number): Promise<(Transaccion & { email: string }) | null>
  abstract reserve(id: number, delivery: DeliveryDetails): Promise<boolean>
  abstract attachExternal(id: number, externalId: string): Promise<void>
  abstract settle(id: number, status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR'): Promise<Transaccion>
}
