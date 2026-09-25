import { webcrypto } from 'node:crypto'
import { tokenizeCard } from './payments.service'

jest.mock('./config', () => ({ apiUrl: 'http://localhost:3000/api' }))

const card = { number: '4242 4242 4242 4242', holder: 'Cliente Ejemplo', month: '12', year: '35', cvc: '123', installments: 1 }
const terms = { sandboxUrl: 'https://sandbox.wompi.co/v1', publicKey: 'pub_test_placeholder',
  privacy: 'https://example.test/privacy', personal: 'https://example.test/personal' }

function decode(part: string) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')), (char) => char.charCodeAt(0))
}

test('tokeniza JWE en Sandbox sin enviar datos de tarjeta al backend ni en texto claro', async () => {
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle })
  const pair = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])
  const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('spki', pair.publicKey)).toString('base64')}\n-----END PUBLIC KEY-----`
  const fetcher = jest.fn().mockResolvedValueOnce({ ok: true,
    json: async () => ({ data: { publicKey: pem } }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'tok_test_placeholder' } }) } as Response)
  global.fetch = fetcher
  expect(await tokenizeCard(card, terms)).toBe('tok_test_placeholder')
  const payload = JSON.parse((fetcher.mock.calls[1][1] as RequestInit).body as string).payload as string
  expect(payload).not.toContain(card.number.replace(/\D/g, ''))
  expect(payload.split('.')).toHaveLength(5)
  const [header, wrapped, iv, encrypted, tag] = payload.split('.')
  expect(JSON.parse(new TextDecoder().decode(decode(header)))).toEqual({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
  const cek = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, pair.privateKey, decode(wrapped))
  const aes = await webcrypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const bytes = new Uint8Array([...decode(encrypted), ...decode(tag)])
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv),
    additionalData: new TextEncoder().encode(header) }, aes, bytes)
  expect(JSON.parse(new TextDecoder().decode(plain))).toMatchObject({ number: '4242424242424242', cvc: '123' })
})

test('permite URL y llave públicas emparejadas de UAT, pero rechaza una mezcla de ambientes', async () => {
  const uat = { ...terms, sandboxUrl: 'https://api-sandbox.co.uat.wompi.dev/v1', publicKey: 'pub_stagtest_placeholder' }
  global.fetch = jest.fn().mockResolvedValue({ ok: false })
  await expect(tokenizeCard(card, uat)).rejects.toThrow('No se pudo tokenizar')
  expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.co.uat.wompi.dev/v1/tokens/keys/tokenization',
    expect.any(Object))
  await expect(tokenizeCard(card, { ...uat, publicKey: terms.publicKey })).rejects.toThrow('Configuración Sandbox inválida')
})

test('impide tokenizar si configuración apunta fuera de Sandbox', async () => {
  await expect(tokenizeCard(card, { ...terms, sandboxUrl: 'https://production.wompi.co/v1' })).rejects.toThrow('Sandbox')
})
