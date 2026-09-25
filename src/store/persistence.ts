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
    if (!isRecord(saved) || (saved.version !== 1 && saved.version !== 2)) return undefined
    const oldId = typeof saved.productId === 'string' ? Number(saved.productId) : saved.productId
    const selectedId = typeof oldId === 'number' && Number.isSafeInteger(oldId) && oldId > 0 ? oldId : null
    const checkout = isRecord(saved.checkout) ? saved.checkout : {}
    const customer = isRecord(checkout.customer) ? checkout.customer : {}
    const delivery = isRecord(checkout.delivery) ? checkout.delivery : {}
    const transaction = isRecord(saved.transaction) && selectedId ? saved.transaction : {}
    const transactionId = typeof transaction.id === 'number' && Number.isSafeInteger(transaction.id) && transaction.id > 0
      ? transaction.id : null
    const steps: CheckoutStep[] = ['producto', 'checkout', 'resumen', 'resultado']

    return {
      product: { ...initialProductState, selectedId },
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
      version: 2,
      productId: state.product.selectedId,
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
