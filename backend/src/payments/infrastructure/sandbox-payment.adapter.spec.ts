import { ConfigService } from '@nestjs/config'
import { SandboxPaymentAdapter } from './sandbox-payment.adapter'

const config = { get: (name: string) => ({ WOMPI_SANDBOX_URL: 'https://sandbox.wompi.co/v1',
  WOMPI_PUBLIC_KEY: 'pub_test_placeholder', WOMPI_PRIVATE_KEY: 'prv_test_placeholder',
  WOMPI_INTEGRITY_SECRET: 'test_integrity_placeholder' })[name] } as ConfigService
const response = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response
const payment = { id: 'sandbox-1', reference: 'order-1', amount_in_cents: 10000,
  currency: 'COP', status: 'PENDING' }

afterEach(() => jest.restoreAllMocks())

test('obtiene ambas políticas actuales sin entregar sus tokens al frontend', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(response({
    presigned_acceptance: { permalink: 'https://example.test/privacy', acceptance_token: 'placeholder-a' },
    presigned_personal_data_auth: { permalink: 'https://example.test/personal', acceptance_token: 'placeholder-b' },
  }))
  expect(await new SandboxPaymentAdapter(config).terms()).toEqual({ privacy: 'https://example.test/privacy',
    personal: 'https://example.test/personal', acceptanceToken: 'placeholder-a', personalToken: 'placeholder-b' })
  expect(fetcher).toHaveBeenCalledWith('https://sandbox.wompi.co/v1/merchants/info',
    expect.objectContaining({ headers: { 'x-merchant-public-key': 'pub_test_placeholder' } }))
})

test('envía solo token de tarjeta, aceptación y firma, consulta con llave privada', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(response(payment))
  const adapter = new SandboxPaymentAdapter(config)
  await adapter.create({ reference: 'order-1', amountInCents: 10000, email: 'customer@example.test',
    cardToken: 'tok_test_placeholder', installments: 1,
    terms: { privacy: '', personal: '', acceptanceToken: 'placeholder-a', personalToken: 'placeholder-b' } })
  const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string)
  expect(body).toMatchObject({ amount_in_cents: 10000, currency: 'COP', payment_method: {
    type: 'CARD', token: 'tok_test_placeholder', installments: 1 },
    acceptance_token: 'placeholder-a', accept_personal_auth: 'placeholder-b' })
  expect(body.signature).toMatch(/^[a-f0-9]{64}$/)
  expect(body).not.toHaveProperty('number')
  expect(await adapter.get('sandbox-1')).toMatchObject({ id: 'sandbox-1', status: 'PENDING' })
  expect(fetcher).toHaveBeenLastCalledWith('https://sandbox.wompi.co/v1/transactions/sandbox-1',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer prv_test_placeholder' }) }))
})

test('acepta solamente la pareja de URL y prefijos Sandbox UAT del documento', async () => {
  const values: Record<string, string> = {
    WOMPI_SANDBOX_URL: 'https://api-sandbox.co.uat.wompi.dev/v1',
    WOMPI_PUBLIC_KEY: 'pub_stagtest_placeholder', WOMPI_PRIVATE_KEY: 'prv_stagtest_placeholder',
    WOMPI_INTEGRITY_SECRET: 'stagtest_integrity_placeholder',
  }
  const uat = { get: (name: string) => values[name] } as ConfigService
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(response(payment))
  await new SandboxPaymentAdapter(uat).get('sandbox-1')
  expect(fetcher).toHaveBeenCalledWith('https://api-sandbox.co.uat.wompi.dev/v1/transactions/sandbox-1',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer prv_stagtest_placeholder' }) }))
  const mixed = { get: (name: string) => name === 'WOMPI_PUBLIC_KEY' ? 'pub_test_placeholder' : values[name] } as ConfigService
  await expect(new SandboxPaymentAdapter(mixed).get('sandbox-1')).rejects.toThrow('Configura Wompi Sandbox')
})

test('rechaza llaves o URL de producción sin bloquear el catálogo al arrancar', async () => {
  const bad = { get: (name: string) => name === 'WOMPI_SANDBOX_URL'
    ? 'https://production.wompi.co/v1' : config.get(name) } as ConfigService
  await expect(new SandboxPaymentAdapter(bad).terms()).rejects.toThrow('Configura Wompi Sandbox')
})

test('traduce a BadGateway un fetch rechazado o una respuesta no exitosa', async () => {
  const adapter = new SandboxPaymentAdapter(config)
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('red caída'))
  await expect(adapter.terms()).rejects.toThrow('No se pudieron obtener los documentos de Wompi')
  await expect(adapter.get('sandbox-1')).rejects.toThrow('No se pudo confirmar')

  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response)
  await expect(adapter.terms()).rejects.toThrow('No se pudieron obtener los documentos de Wompi')
  await expect(adapter.create({ reference: 'order-1', amountInCents: 100, email: 'c@e.test',
    cardToken: 'tok_test_x', installments: 1,
    terms: { privacy: '', personal: '', acceptanceToken: 'a', personalToken: 'b' } }))
    .rejects.toThrow('No se pudo confirmar')
})

test.each([
  ['permalink no https', { presigned_acceptance: { permalink: 'http://inseguro', acceptance_token: 'a' },
    presigned_personal_data_auth: { permalink: 'https://ok.test', acceptance_token: 'b' } }],
  ['token de aceptación ausente', { presigned_acceptance: { permalink: 'https://ok.test', acceptance_token: '' },
    presigned_personal_data_auth: { permalink: 'https://ok.test', acceptance_token: 'b' } }],
  ['documento personal ausente', { presigned_acceptance: { permalink: 'https://ok.test', acceptance_token: 'a' },
    presigned_personal_data_auth: null }],
])('rechaza documentos incompletos: %s', async (_caso, data) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response(data))
  await expect(new SandboxPaymentAdapter(config).terms()).rejects.toThrow('Documentos de Wompi inválidos')
})

test.each([
  ['estado desconocido', { ...payment, status: 'STRANGE' }],
  ['moneda distinta de COP', { ...payment, currency: 'USD' }],
  ['monto fraccionario', { ...payment, amount_in_cents: 10.5 }],
  ['referencia ausente', { ...payment, reference: 42 }],
])('rechaza respuestas de pago malformadas: %s', async (_caso, data) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response(data))
  await expect(new SandboxPaymentAdapter(config).get('sandbox-1')).rejects.toThrow('Estado de Wompi desconocido')
})

test('entrega la llave pública de tokenización y convierte un JWE en token', async () => {
  const fetcher = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(response({ publicKey: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' }))
    .mockResolvedValueOnce(response({ id: 'tok_test_xyz' }))
  const adapter = new SandboxPaymentAdapter(config)
  expect(await adapter.tokenizationKey()).toContain('BEGIN PUBLIC KEY')
  expect(fetcher).toHaveBeenCalledWith('https://sandbox.wompi.co/v1/tokens/keys/tokenization',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer pub_test_placeholder' }) }))
  expect(await adapter.tokenizeCard('a.b.c.d.e')).toBe('tok_test_xyz')
  const [url, options] = fetcher.mock.calls[1] as [string, RequestInit]
  expect(url).toBe('https://sandbox.wompi.co/v1/tokens/cards')
  expect(JSON.parse(options.body as string)).toEqual({ payload: 'a.b.c.d.e' })
  expect(JSON.stringify(options.body)).not.toMatch(/number|cvc|holder/i)
})

test.each([
  ['llave no PEM', { publicKey: 'no-es-pem' }],
  ['sin llave', {}],
])('rechaza una llave de tokenización malformada: %s', async (_caso, data) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response(data))
  await expect(new SandboxPaymentAdapter(config).tokenizationKey()).rejects.toThrow('Llave de tokenización')
})

test.each([
  ['token de producción', { id: 'tok_prod_xyz' }],
  ['sin token', {}],
])('rechaza una tokenización sin token válido: %s', async (_caso, data) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response(data))
  await expect(new SandboxPaymentAdapter(config).tokenizeCard('a.b.c.d.e'))
    .rejects.toThrow('token de tarjeta válido')
})

test('rechaza un identificador externo con caracteres peligrosos antes de llamar', async () => {
  const fetcher = jest.spyOn(global, 'fetch')
  await expect(new SandboxPaymentAdapter(config).get('id/../admin')).rejects.toThrow('Identificador externo inválido')
  expect(fetcher).not.toHaveBeenCalled()
})
