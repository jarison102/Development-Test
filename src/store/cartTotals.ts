import type { CartItem } from './cartSlice'

export function cartSubtotal(item: CartItem): string {
  const [whole, fraction] = item.price.split('.')
  const cents = (BigInt(whole) * 100n + BigInt(fraction)) * BigInt(item.quantity)
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

export function cartTotal(items: CartItem[]): string {
  const cents = items.reduce((total, item) => {
    const [whole, fraction] = item.price.split('.')
    return total + (BigInt(whole) * 100n + BigInt(fraction)) * BigInt(item.quantity)
  }, 0n)
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}
