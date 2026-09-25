import { clearCard, getCard, saveCard, validCard } from './card'

const card = { number: '4242 4242 4242 4242', holder: 'Cliente Ejemplo', month: '12', year: '35', cvc: '123', installments: 1 }

afterEach(() => clearCard())

test('validación local detecta Luhn, expiración, CVV y cuotas', () => {
  expect(validCard(card)).toBe(true)
  expect(validCard({ ...card, number: '4242 4242 4242 4243' })).toBe(false)
  expect(validCard({ ...card, month: '00' })).toBe(false)
  expect(validCard({ ...card, year: '20' })).toBe(false)
  expect(validCard({ ...card, cvc: '12' })).toBe(false)
  expect(validCard({ ...card, installments: 0 })).toBe(false)
})

test('se guarda solo en memoria y se puede borrar', () => {
  saveCard(card)
  expect(getCard()).toBe(card)
  expect(localStorage.getItem('payment-checkout-progress-v1')).toBeNull()
  clearCard()
  expect(getCard()).toBeNull()
})
