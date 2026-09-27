import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AppError } from '../result/app-error'
import { err, ok } from '../result/result'
import { toHttp } from './result-to-http'

describe('toHttp', () => {
  it('mantiene el sobre data para resultados correctos', () => {
    expect(toHttp(ok({ id: 1 }))).toEqual({ data: { id: 1 } })
  })

  it.each([
    ['NotFound', 404], ['Conflict', 409], ['StockInsuficiente', 409], ['Validation', 400],
    ['PaymentDeclined', 402], ['PaymentProviderError', 502], ['Unexpected', 500],
  ] as const)('convierte %s al código %i conservando el mensaje', (kind, status) => {
    try {
      toHttp(err({ kind, message: 'Mensaje de prueba' } as AppError))
      throw new Error('Debió lanzar una excepción')
    } catch (error) {
      expect(error).toMatchObject({ status })
      expect((error as { message: string }).message).toBe('Mensaje de prueba')
    }
  })

  it('conserva errores HTTP existentes de adaptadores', () => {
    expect(() => toHttp(err({ kind: 'Unexpected', message: 'Error interno del servidor',
      cause: new ConflictException('Conflicto existente') }))).toThrow('Conflicto existente')
  })

  it('conserva el contrato para conflictos de Prisma', () => {
    const cause = new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: '6.12.0' })
    expect(() => toHttp(err({ kind: 'Unexpected', message: 'Error interno del servidor', cause }))).toThrow('Conflicto con los datos existentes')
  })
})
