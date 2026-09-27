import type { Delivery } from '../types/checkout'
import type { TransactionRecord } from '../types/transaction'
import { ApiError, apiRequest } from './api'
import type { Card } from './card'
import { toTransaction, type ApiTransaction } from './transacciones.service'

export type PaymentTerms = { privacy: string; personal: string; publicKey: string; sandboxUrl: string
  tokenizationKey: string }

export function getPaymentTerms() { return apiRequest<PaymentTerms>('/payments/terms') }

function base64url(bytes: Uint8Array) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function encryptCard(card: Card, pem: string) {
  const spki = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (character) => character.charCodeAt(0))
  const rsa = await crypto.subtle.importKey('spki', spki, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
  const cek = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const body = new TextEncoder().encode(JSON.stringify({ number: card.number.replace(/\D/g, ''),
    cvc: card.cvc, exp_month: card.month, exp_year: card.year, card_holder: card.holder }))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: new TextEncoder().encode(header), tagLength: 128 }, aes, body))
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, cek))
  return [header, base64url(wrapped), base64url(iv), base64url(encrypted.slice(0, -16)),
    base64url(encrypted.slice(-16))].join('.')
}

export async function tokenizeCard(card: Card, terms: PaymentTerms): Promise<string> {
  const publicSandbox = terms.sandboxUrl === 'https://sandbox.wompi.co/v1' && terms.publicKey.startsWith('pub_test_')
  const testUat = terms.sandboxUrl === 'https://api-sandbox.co.uat.wompi.dev/v1'
    && terms.publicKey.startsWith('pub_stagtest_')
  if (!publicSandbox && !testUat) throw new ApiError('El pago de prueba no está disponible en este momento. Intenta más tarde.')
  try {
    const payload = await encryptCard(card, terms.tokenizationKey)
    const result = await apiRequest<{ token: string }>('/payments/tokenize', {
      method: 'POST', body: JSON.stringify({ payload }),
    })
    if (!/^tok_(?!prod_)[a-zA-Z0-9_-]+$/.test(result.token)) throw new Error()
    return result.token
  } catch {
    throw new ApiError('No pudimos procesar los datos de tu tarjeta. Revisa tu conexión e inténtalo de nuevo.')
  }
}

export async function payTransaction(id: number, key: string, token: string, installments: number,
  delivery: Delivery, terms: PaymentTerms): Promise<TransactionRecord> {
  return toTransaction(await apiRequest<ApiTransaction>(`/payments/${id}`, {
    method: 'POST', headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ cardToken: token, installments, acceptPrivacy: true, acceptPersonal: true,
      privacyDocument: terms.privacy, personalDocument: terms.personal,
      address: delivery.address, city: delivery.city, department: delivery.department, postalCode: delivery.postalCode }) }))
}

export async function checkPayment(id: number, key: string): Promise<TransactionRecord> {
  return toTransaction(await apiRequest<ApiTransaction>(`/payments/${id}`, { headers: { 'Idempotency-Key': key } }))
}
