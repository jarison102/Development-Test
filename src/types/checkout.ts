export type CheckoutStep = 'producto' | 'checkout' | 'resumen' | 'resultado'

export type Customer = {
  name: string
  email: string
  phone: string
}

export type Delivery = {
  address: string
  city: string
  department: string
  postalCode: string
}

export type PurchaseSummary = {
  productId: number
  quantity: number
  subtotal: string
  baseFee: string
  shippingFee: string
  total: string
}
