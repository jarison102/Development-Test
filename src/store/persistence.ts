import { initialCartState, type CartItem } from './cartSlice'
import { initialCheckoutState } from './checkoutSlice'
import { initialProductState } from './productSlice'
import { initialTransactionState } from './transactionSlice'
import type { CheckoutStep } from '../types/checkout'
import type { RootState } from './store'

export const STORAGE_KEY = 'payment-checkout-progress-v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' && value.length <= 300 ? value : ''
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage }
  catch { return null }
}

export function loadPersistedState(): RootState | undefined {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const saved: unknown = JSON.parse(raw)
    if (!isRecord(saved) || (saved.version !== 1 && saved.version !== 2 && saved.version !== 3)) return undefined
    const oldId = typeof saved.productId === 'string' ? Number(saved.productId) : saved.productId
    const selectedId = typeof oldId === 'number' && Number.isSafeInteger(oldId) && oldId > 0 ? oldId : null
    const checkout = isRecord(saved.checkout) ? saved.checkout : {}
    const customer = isRecord(checkout.customer) ? checkout.customer : {}
    const delivery = isRecord(checkout.delivery) ? checkout.delivery : {}
    const transaction = isRecord(saved.transaction) && selectedId ? saved.transaction : {}
    const transactionId = typeof transaction.id === 'number' && Number.isSafeInteger(transaction.id) && transaction.id > 0
      ? transaction.id : null
    const steps: CheckoutStep[] = ['producto', 'checkout', 'resumen', 'resultado']
    const items: CartItem[] = []
    if (isRecord(saved.cart) && Array.isArray(saved.cart.items)) {
      for (const value of saved.cart.items.slice(0, 50)) {
        if (!isRecord(value) || typeof value.productId !== 'number' || !Number.isSafeInteger(value.productId)
          || value.productId < 1 || typeof value.name !== 'string' || value.name.length > 150
          || typeof value.price !== 'string' || !/^\d{1,10}\.\d{2}$/.test(value.price)
          || typeof value.stock !== 'number' || !Number.isSafeInteger(value.stock) || value.stock < 0
          || typeof value.quantity !== 'number' || !Number.isSafeInteger(value.quantity) || value.quantity < 1
          || value.image !== null && (typeof value.image !== 'string' || value.image.length > 500)
          || items.some((item) => item.productId === value.productId)) continue
        items.push({ productId: value.productId, name: value.name, price: value.price,
          image: typeof value.image === 'string' ? value.image : null, stock: value.stock, quantity: Math.min(value.quantity, Math.max(1, value.stock)) })
      }
    }

    return {
      product: { ...initialProductState, selectedId },
      cart: { ...initialCartState, items },
      checkout: {
        ...initialCheckoutState,
        quantity: typeof checkout.quantity === 'number' && Number.isSafeInteger(checkout.quantity)
          && checkout.quantity > 0 ? checkout.quantity : 1,
        customer: { name: text(customer.name), email: text(customer.email), phone: text(customer.phone) },
        delivery: {
          address: text(delivery.address), city: text(delivery.city),
          department: text(delivery.department), postalCode: text(delivery.postalCode),
        },
        step: selectedId && steps.includes(checkout.step as CheckoutStep) ? checkout.step as CheckoutStep : 'producto',
        clientId: typeof checkout.clientId === 'number' && Number.isSafeInteger(checkout.clientId)
          && checkout.clientId > 0 ? checkout.clientId : null,
        idempotencyKey: typeof checkout.idempotencyKey === 'string'
          && /^[0-9a-f-]{36}$/i.test(checkout.idempotencyKey) ? checkout.idempotencyKey : null,
      },
      transaction: {
        ...initialTransactionState,
        id: transactionId,
        reference: transactionId ? text(transaction.reference) || null : null,
      },
    }
  } catch { return undefined }
}

export function saveProgress(state: RootState): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({
      version: 3,
      productId: state.product.selectedId,
      cart: { items: state.cart.items.map(({ productId, name, price, image, stock, quantity }) =>
        ({ productId, name, price, image, stock, quantity })) },
      checkout: {
        quantity: state.checkout.quantity,
        customer: {
          name: state.checkout.customer.name,
          email: state.checkout.customer.email,
          phone: state.checkout.customer.phone,
        },
        delivery: {
          address: state.checkout.delivery.address,
          city: state.checkout.delivery.city,
          department: state.checkout.delivery.department,
          postalCode: state.checkout.delivery.postalCode,
        },
        step: state.checkout.step,
        clientId: state.checkout.clientId,
        idempotencyKey: state.checkout.idempotencyKey,
      },
      transaction: { id: state.transaction.id, reference: state.transaction.reference },
    }))
  } catch { return }
}
