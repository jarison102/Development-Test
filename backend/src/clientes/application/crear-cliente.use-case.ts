import { Injectable } from '@nestjs/common'
import { AppError, unexpected } from '../../common/result/app-error'
import { err, fromPromise } from '../../common/result/result'
import { ClientesPort } from '../domain/clientes.port'
import { NuevoCliente } from '../domain/cliente'

@Injectable()
export class CrearCliente {
  constructor(private readonly clientes: ClientesPort) {}

  async execute(data: NuevoCliente) {
    if (!data.nombre.trim() || !data.telefono.trim()) return err<AppError>({ kind: 'Validation', message: 'Nombre y teléfono son obligatorios' })
    return fromPromise(() => this.clientes.crear({
      nombre: data.nombre.trim(),
      correo: data.correo.trim().toLowerCase(),
      telefono: data.telefono.trim(),
    }), unexpected)
  }
}
