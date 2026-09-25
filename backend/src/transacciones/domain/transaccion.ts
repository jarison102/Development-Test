export type EstadoTransaccion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'

export type Transaccion = {
  id: number
  referencia: string
  productoId: number
  clienteId: number
  cantidad: number
  subtotal: string
  tarifaBase: string
  tarifaEnvio: string
  total: string
  estado: EstadoTransaccion
  idTransaccionExterna: string | null
}

export type NuevaTransaccion = Omit<Transaccion, 'id' | 'estado' | 'idTransaccionExterna'>
