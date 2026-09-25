export type Card = { number: string; holder: string; month: string; year: string; cvc: string; installments: number }
let pendingCard: Card | null = null

export function validCard(card: Card): boolean {
  const number = card.number.replace(/[\s-]/g, '')
  const digits = number.split('').reverse().map(Number)
  const sum = digits.reduce((total, digit, index) => {
    const doubled = index % 2 ? digit * 2 : digit
    return total + (doubled > 9 ? doubled - 9 : doubled)
  }, 0)
  const year = Number(card.year)
  const month = Number(card.month)
  const now = new Date()
  const expires = new Date(2000 + year, month, 0, 23, 59, 59)
  return /^\d{13,19}$/.test(number) && sum % 10 === 0 && card.holder.trim().length > 1
    && /^\d{2}$/.test(card.month) && month >= 1 && month <= 12
    && /^\d{2}$/.test(card.year) && expires >= now && expires.getFullYear() <= now.getFullYear() + 20
    && /^\d{3,4}$/.test(card.cvc) && Number.isInteger(card.installments)
    && card.installments >= 1 && card.installments <= 36
}

export function saveCard(card: Card) { pendingCard = card }
export function getCard() { return pendingCard }
export function clearCard() { pendingCard = null }
