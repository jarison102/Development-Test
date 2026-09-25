export type Cliente = {
  id: number
  nombre: string
  correo: string
  telefono: string
}

export type NuevoCliente = Omit<Cliente, 'id'>
