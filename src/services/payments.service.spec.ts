import { webcrypto } from 'node:crypto'
import { checkPayment, payTransaction, tokenizeCard } from './payments.service'

jest.mock('./config', () => ({ apiUrl: 'http://localhost:3000/api' }))

const card = { number: '4242 4242 4242 4242', holder: 'Cliente Ejemplo', month: '12', year: '35', cvc: '123', installments: 1 }
let pem = ''
let privateKey: webcrypto.CryptoKey
const terms = { sandboxUrl: 'https://sandbox.wompi.co/v1', publicKey: 'pub_test_placeholder',
  privacy: 'https://example.test/privacy', personal: 'https://example.test/personal', tokenizationKey: '' }
const uat = { ...terms, sandboxUrl: 'https://api-sandbox.co.uat.wompi.dev/v1', publicKey: 'pub_stagtest_placeholder' }

function decode(part: string) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')), (char) => char.charCodeAt(0))
}

beforeAll(async () => {
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle })
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])
  pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('spki', pair.publicKey)).toString('base64')}\n-----END PUBLIC KEY-----`
  privateKey = pair.privateKey
})

beforeEach(() => { terms.tokenizationKey = pem; uat.tokenizationKey = pem })

test('cifra la tarjeta como JWE y la envía solo al backend, nunca el PAN', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { token: 'tok_test_placeholder' } }) } as Response)
  global.fetch = fetcher
  expect(await tokenizeCard(card, terms)).toBe('tok_test_placeholder')
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [url, options] = fetcher.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('http://localhost:3000/api/payments/tokenize')
  expect(url).not.toContain('wompi')
  const payload = JSON.parse(options.body as string).payload as string
  expect(payload).not.toContain(card.number.replace(/\D/g, ''))
  expect(payload.split('.')).toHaveLength(5)
  const [header, wrapped, iv, encrypted, tag] = payload.split('.')
  expect(JSON.parse(new TextDecoder().decode(decode(header)))).toEqual({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
  const cek = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, decode(wrapped))
  const aes = await webcrypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const bytes = new Uint8Array([...decode(encrypted), ...decode(tag)])
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv),
    additionalData: new TextEncoder().encode(header) }, aes, bytes)
  expect(JSON.parse(new TextDecoder().decode(plain))).toMatchObject({ number: '4242424242424242', cvc: '123' })
})

test.each([uat, { ...uat, publicKey: 'pub_test_placeholder' }])('valida la pareja URL/llave del ambiente %#', async (config) => {
  global.fetch = jest.fn()
  const mixed = config.publicKey.startsWith('pub_test_') && config.sandboxUrl.includes('uat')
  await expect(tokenizeCard(card, config)).rejects.toThrow(mixed ? 'Configuración Sandbox inválida' : 'No se pudo tokenizar')
})

test('el error del backend se traduce en un ApiError seguro', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as Response)
  await expect(tokenizeCard(card, terms)).rejects.toThrow('No se pudo tokenizar')
})

test('rechaza una respuesta del backend sin token válido', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { token: 'tok_prod_real' } }) } as Response)
  await expect(tokenizeCard(card, terms)).rejects.toThrow('No se pudo tokenizar')
})

test('impide tokenizar si configuración apunta fuera de Sandbox', async () => {
  await expect(tokenizeCard(card, { ...terms, sandboxUrl: 'https://production.wompi.co/v1' })).rejects.toThrow('Sandbox')
})

const apiTransaction = { id: 11, referencia: 'ref-11', productoId: 3, clienteId: 18, cantidad: 1,
  subtotal: '150000.00', tarifaBase: '1500.00', tarifaEnvio: '5000.00', total: '156500.00',
  estado: 'PENDIENTE', idTransaccionExterna: '15113-x' }

test.each([
  ['checkPayment', () => checkPayment(11, 'key')],
  ['payTransaction', () => payTransaction(11, 'key', 'tok_test_x', 1,
    { address: 'calle', city: 'bogota', department: 'bogota', postalCode: '' }, terms)],
])('%s traduce la respuesta cruda del backend al registro de la UI', async (_name, call) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: apiTransaction }) } as Response)
  expect(await call()).toMatchObject({ id: 11, reference: 'ref-11', productId: 3, customerId: 18,
    quantity: 1, status: 'PENDIENTE', externalId: '15113-x', total: '156500.00' })
})

test('checkPayment rechaza una respuesta que no sea una transacción válida', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 11 } }) } as Response)
  await expect(checkPayment(11, 'key')).rejects.toThrow('El servidor devolvió')
})
