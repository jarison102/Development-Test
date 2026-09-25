import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ClientesPort } from '../../clientes/domain/clientes.port'
import { TransaccionesPort } from '../../transacciones/domain/transacciones.port'
import { CrearEntregaDto } from '../dto/crear-entrega.dto'
import { EntregasPort } from '../domain/entregas.port'

@Injectable()
export class CrearEntrega {
  constructor(
    private readonly transacciones: TransaccionesPort,
    private readonly clientes: ClientesPort,
    private readonly entregas: EntregasPort,
  ) {}

  async execute(data: CrearEntregaDto) {
    const transaccion = await this.transacciones.buscar(data.transaccionId)
    if (!transaccion) throw new NotFoundException('Transacción no encontrada')
    if (!await this.clientes.buscar(data.clienteId)) throw new NotFoundException('Cliente no encontrado')
    if (transaccion.clienteId !== data.clienteId) throw new ConflictException('El cliente no pertenece a la transacción')
    if (transaccion.estado !== 'APROBADA') throw new ConflictException('La transacción no está aprobada')
    if (await this.entregas.buscarPorTransaccion(transaccion.id)) throw new ConflictException('La transacción ya tiene una entrega')
    if (![data.direccion, data.ciudad, data.departamento].every((value) => value.trim())) {
      throw new BadRequestException('La dirección, ciudad y departamento son obligatorios')
    }

    const entrega = await this.entregas.crearSiAprobadaYUnica({
      transaccionId: transaccion.id,
      clienteId: data.clienteId,
      direccion: data.direccion.trim(),
      ciudad: data.ciudad.trim(),
      departamento: data.departamento.trim(),
      codigoPostal: data.codigoPostal?.trim() || null,
    })
    if (!entrega) throw new ConflictException('La transacción cambió de estado o ya tiene una entrega')
    return entrega
  }
}
