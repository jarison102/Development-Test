import { Injectable } from '@nestjs/common'
import { ClientesPort } from '../../clientes/domain/clientes.port'
import { AppError, unexpected } from '../../common/result/app-error'
import { Result, err, fromPromise, isErr, ok } from '../../common/result/result'
import { TransaccionesPort } from '../../transacciones/domain/transacciones.port'
import { CrearEntregaDto } from '../dto/crear-entrega.dto'
import { Entrega } from '../domain/entrega'
import { EntregasPort } from '../domain/entregas.port'

@Injectable()
export class CrearEntrega {
  constructor(
    private readonly transacciones: TransaccionesPort,
    private readonly clientes: ClientesPort,
    private readonly entregas: EntregasPort,
  ) {}

  async execute(data: CrearEntregaDto): Promise<Result<Entrega, AppError>> {
    const transaction = await fromPromise(() => this.transacciones.buscar(data.transaccionId), unexpected)
    if (isErr(transaction)) return transaction
    const order = transaction.value
    if (!order) return err({ kind: 'NotFound', message: 'Transacción no encontrada' })
    const customer = await fromPromise(() => this.clientes.buscar(data.clienteId), unexpected)
    if (isErr(customer)) return customer
    if (!customer.value) return err({ kind: 'NotFound', message: 'Cliente no encontrado' })
    if (order.clienteId !== data.clienteId) return err({ kind: 'Conflict', message: 'El cliente no pertenece a la transacción' })
    if (order.estado !== 'APROBADA') return err({ kind: 'Conflict', message: 'La transacción no está aprobada' })
    const existing = await fromPromise(() => this.entregas.buscarPorTransaccion(order.id), unexpected)
    if (isErr(existing)) return existing
    if (existing.value) return err({ kind: 'Conflict', message: 'La transacción ya tiene una entrega' })
    if (![data.direccion, data.ciudad, data.departamento].every((value) => value.trim())) {
      return err({ kind: 'Validation', message: 'La dirección, ciudad y departamento son obligatorios' })
    }
    const delivery = await fromPromise(() => this.entregas.crearSiAprobadaYUnica({
      transaccionId: order.id,
      clienteId: data.clienteId,
      direccion: data.direccion.trim(),
      ciudad: data.ciudad.trim(),
      departamento: data.departamento.trim(),
      codigoPostal: data.codigoPostal?.trim() || null,
    }), unexpected)
    if (isErr(delivery)) return delivery
    if (!delivery.value) return err({ kind: 'Conflict', message: 'La transacción cambió de estado o ya tiene una entrega' })
    return ok(delivery.value)
  }
}
