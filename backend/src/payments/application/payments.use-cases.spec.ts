import { createHash } from 'node:crypto'
import { BadGatewayException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppError } from '../../common/result/app-error'
import { Result, isErr } from '../../common/result/result'
import { PaymentsUseCases } from './payments.use-cases'
import { PaymentGatewayPort } from '../ports/payment-gateway.port'
import { PaymentOrdersPort } from '../ports/payment-orders.port'

const key = 'ef3b98af-a0c7-410b-bf32-3f126709aed1'
const reference = createHash('sha256').update(`checkout:${key}`).digest('hex')
const order = { id: 3, referencia: reference, productoId: 1, clienteId: 2, cantidad: 1,
  subtotal: '100.00', tarifaBase: '0.00', tarifaEnvio: '0.00', total: '100.00',
  estado: 'PENDIENTE' as const, idTransaccionExterna: null, email: 'customer@example.test' }
const terms = { privacy: 'https://example.test/privacy', personal: 'https://example.test/personal',
  acceptanceToken: 'placeholder-acceptance', personalToken: 'placeholder-personal' }
const input = { cardToken: 'tok_test_placeholder', installments: 1, acceptPrivacy: true,
  acceptPersonal: true, privacyDocument: terms.privacy, personalDocument: terms.personal,
  address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca' }
const external = { id: 'sandbox-1', reference, amountInCents: 10000, currency: 'COP', status: 'PENDING' as const }

function setup() {
  const gateway = { terms: jest.fn().mockResolvedValue(terms), create: jest.fn().mockResolvedValue(external),
    get: jest.fn().mockResolvedValue(external),
    tokenizationKey: jest.fn().mockResolvedValue('-----BEGIN PUBLIC KEY-----\npem\n-----END PUBLIC KEY-----'),
    tokenizeCard: jest.fn().mockResolvedValue('tok_test_xyz') } as unknown as jest.Mocked<PaymentGatewayPort>
  const orders = { get: jest.fn().mockResolvedValue(order), reserve: jest.fn().mockResolvedValue(true),
    attachExternal: jest.fn().mockResolvedValue(undefined), settle: jest.fn().mockResolvedValue({ ...order, estado: 'APROBADA' }) } as unknown as jest.Mocked<PaymentOrdersPort>
  const useCase = new PaymentsUseCases(gateway, orders, {} as ConfigService)
  return { gateway, orders, useCase }
}

async function expectFailure(result: Promise<Result<unknown, AppError>>, kind: AppError['kind']) {
  const value = await result
  expect(isErr(value)).toBe(true)
  expect(value).toMatchObject({ error: { kind } })
}

test('crea una sola operación tras reservar; PENDING no liquida ni descuenta', async () => {
  const { useCase, gateway, orders } = setup()
  expect(await useCase.pay(3, key, input)).toMatchObject({ ok: true, value: { estado: 'PENDIENTE' } })
  expect(orders.reserve).toHaveBeenCalledTimes(1)
  expect(gateway.create).toHaveBeenCalledWith(expect.objectContaining({ amountInCents: 10000, reference }))
  expect(orders.attachExternal).toHaveBeenCalledWith(3, 'sandbox-1')
  expect(orders.settle).not.toHaveBeenCalled()
})

test.each(['APPROVED', 'DECLINED', 'ERROR'] as const)('concilia %s según resultado externo', async (status) => {
  const { useCase, gateway, orders } = setup()
  orders.get.mockResolvedValue({ ...order, idTransaccionExterna: 'sandbox-1' })
  gateway.get.mockResolvedValue({ ...external, status })
  orders.settle.mockResolvedValue({ ...order, estado: status === 'APPROVED' ? 'APROBADA' : 'RECHAZADA' })
  const result = await useCase.check(3, key)
  expect(result).toMatchObject({ ok: true, value: { estado: status === 'APPROVED' ? 'APROBADA' : 'RECHAZADA' } })
  expect(orders.settle).toHaveBeenCalledWith(3, status)
  expect(gateway.create).not.toHaveBeenCalled()
})

test('reintento en vuelo no crea un segundo pago', async () => {
  const { useCase, gateway, orders } = setup()
  orders.reserve.mockResolvedValue(false)
  await useCase.pay(3, key, input)
  expect(gateway.create).not.toHaveBeenCalled()
})

test('falla cerrado ante cambios de contratos, referencia o clave ajena', async () => {
  const { useCase, gateway, orders } = setup()
  await expectFailure(useCase.pay(3, key, { ...input, privacyDocument: 'https://example.test/old' }), 'Conflict')
  expect(orders.reserve).not.toHaveBeenCalled()
  gateway.create.mockResolvedValue({ ...external, reference: 'other' })
  await expectFailure(useCase.pay(3, key, input), 'Conflict')
  expect(orders.attachExternal).not.toHaveBeenCalled()
  await expectFailure(useCase.pay(3, 'ba3b98af-a0c7-410b-bf32-3f126709aed1', input), 'NotFound')
})

test('error de proveedor deja reserva para conciliación sin marcar pago rechazado', async () => {
  const { useCase, gateway, orders } = setup()
  gateway.create.mockRejectedValue(new Error('unavailable'))
  await expectFailure(useCase.pay(3, key, input), 'PaymentProviderError')
  expect(orders.settle).not.toHaveBeenCalled()
})

test('errores de proveedor se convierten en PaymentProviderError 502 sin liquidar', async () => {
  const { useCase, gateway, orders } = setup()
  gateway.create.mockRejectedValue(new BadGatewayException('Proveedor no disponible'))
  const result = await useCase.pay(3, key, input)
  expect(result).toMatchObject({ ok: false, error: { kind: 'PaymentProviderError', message: 'Proveedor no disponible', httpStatus: 502 } })
  expect(orders.settle).not.toHaveBeenCalled()
})

test('terms publica solo documentos y configuración pública', async () => {
  const { gateway, orders } = setup()
  const config = { getOrThrow: (name: string) => ({ WOMPI_PUBLIC_KEY: 'pub_test_placeholder',
    WOMPI_SANDBOX_URL: 'https://sandbox.wompi.co/v1' })[name] } as unknown as ConfigService
  const useCase = new PaymentsUseCases(gateway, orders, config)
  expect(await useCase.terms()).toEqual({ ok: true, value: { privacy: terms.privacy, personal: terms.personal,
    publicKey: 'pub_test_placeholder', sandboxUrl: 'https://sandbox.wompi.co/v1',
    tokenizationKey: expect.stringContaining('BEGIN PUBLIC KEY') } })
  expect(gateway.terms).toHaveBeenCalledTimes(1)
  expect(gateway.tokenizationKey).toHaveBeenCalledTimes(1)
})

test('tokenize reenvía el JWE al proveedor y devuelve solo el token', async () => {
  const { useCase, gateway } = setup()
  expect(await useCase.tokenize('a.b.c.d.e')).toEqual({ ok: true, value: { token: 'tok_test_xyz' } })
  expect(gateway.tokenizeCard).toHaveBeenCalledWith('a.b.c.d.e')
})

test.each([
  ['vacía', ''],
  ['con formato inválido', 'no-es-un-uuid'],
])('rechaza Idempotency-Key %s sin consultar la orden', async (_caso, invalid) => {
  const { useCase, orders } = setup()
  await expectFailure(useCase.pay(3, invalid, input), 'Validation')
  await expectFailure(useCase.check(3, invalid), 'Validation')
  expect(orders.get).not.toHaveBeenCalled()
})

test('devuelve 404 si la orden no existe o la referencia no coincide con la clave', async () => {
  const { useCase, orders } = setup()
  orders.get.mockResolvedValue(null)
  await expectFailure(useCase.pay(3, key, input), 'NotFound')
  orders.get.mockResolvedValue({ ...order, referencia: 'otra' })
  await expectFailure(useCase.check(3, key), 'NotFound')
})

test('una orden ya cerrada no vuelve al proveedor', async () => {
  const { useCase, gateway, orders } = setup()
  orders.get.mockResolvedValue({ ...order, estado: 'APROBADA', idTransaccionExterna: 'sandbox-1' })
  const result = await useCase.pay(3, key, input)
  expect(result).toMatchObject({ ok: true, value: { estado: 'APROBADA' } })
  expect(gateway.create).not.toHaveBeenCalled()
  expect(gateway.get).not.toHaveBeenCalled()
  expect(orders.settle).not.toHaveBeenCalled()
})

test('check en PENDIENTE sin identificador externo no consulta al proveedor', async () => {
  const { useCase, gateway } = setup()
  const result = await useCase.check(3, key)
  expect(result).toMatchObject({ ok: true, value: { estado: 'PENDIENTE' } })
  if (isErr(result)) throw new Error('La consulta debe ser exitosa')
  expect(result.value).not.toHaveProperty('email')
  expect(gateway.get).not.toHaveBeenCalled()
})

test('check exige que el proveedor devuelva el mismo identificador externo', async () => {
  const { useCase, gateway, orders } = setup()
  orders.get.mockResolvedValue({ ...order, idTransaccionExterna: 'sandbox-1' })
  gateway.get.mockResolvedValue({ ...external, id: 'otro-id' })
  await expectFailure(useCase.check(3, key), 'Conflict')
  expect(orders.settle).not.toHaveBeenCalled()
})

test('check no liquida una respuesta que no coincide con la orden', async () => {
  const { useCase, gateway, orders } = setup()
  orders.get.mockResolvedValue({ ...order, idTransaccionExterna: 'sandbox-1' })
  gateway.get.mockResolvedValue({ ...external, amountInCents: 999 })
  await expectFailure(useCase.check(3, key), 'Conflict')
  expect(orders.settle).not.toHaveBeenCalled()
})
