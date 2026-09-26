export type TransactionStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'

export type TransactionRecord = {
  id: number
  reference: string
  productId: number
  items?: { productId: number; quantity: number; unitPrice: string; subtotal: string }[]
  customerId: number
  quantity: number
  subtotal: string
  baseFee: string
  shippingFee: string
  total: string
  status: TransactionStatus
  externalId: string | null
}

export type TransactionState = {
  id: number | null
  reference: string | null
  record: TransactionRecord | null
  creating: boolean
  loading: boolean
  error: string | null
}
