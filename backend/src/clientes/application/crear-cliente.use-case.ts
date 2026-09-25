import { BadRequestException, Injectable } from '@nestjs/common'
import { ClientesPort } from '../domain/clientes.port'
import { NuevoCliente } from '../domain/cliente'

@Injectable()
export class CrearCliente {
  constructor(private readonly clientes: ClientesPort) {}

  execute(data: NuevoCliente) {
    if (!data.nombre.trim() || !data.telefono.trim()) throw new BadRequestException('Nombre y teléfono son obligatorios')
    return this.clientes.crear({
      nombre: data.nombre.trim(),
      correo: data.correo.trim().toLowerCase(),
      telefono: data.telefono.trim(),
    })
  }
}
