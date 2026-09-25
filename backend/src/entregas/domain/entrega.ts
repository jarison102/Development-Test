export type Entrega = {
  id: number
  transaccionId: number
  clienteId: number
  direccion: string
  ciudad: string
  departamento: string
  codigoPostal: string | null
  estado: 'PENDIENTE' | 'EN_PREPARACION' | 'ENVIADA' | 'ENTREGADA'
}

export type NuevaEntrega = Omit<Entrega, 'id' | 'estado'>
