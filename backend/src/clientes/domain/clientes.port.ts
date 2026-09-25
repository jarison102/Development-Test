import { Cliente, NuevoCliente } from './cliente'

export abstract class ClientesPort {
  abstract buscar(id: number): Promise<Cliente | null>
  abstract crear(cliente: NuevoCliente): Promise<Cliente>
}
