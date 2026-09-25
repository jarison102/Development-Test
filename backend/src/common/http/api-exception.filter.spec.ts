import { ArgumentsHost, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ApiExceptionFilter } from './api-exception.filter'

function capture() {
  const sent: { status?: number; body?: { error: { code: string; message: unknown } } } = {}
  const response = { status: (code: number) => { sent.status = code
    return { send: (body: object) => { sent.body = body as typeof sent.body } } } }
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost
  return { host, sent }
}

const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: '6' })

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter()

  it('propaga el mensaje de una HttpException con cuerpo objeto', () => {
    const { host, sent } = capture()
    filter.catch(new NotFoundException('Producto no encontrado'), host)
    expect(sent.status).toBe(404)
    expect(sent.body?.error).toEqual({ code: 'NOT_FOUND', message: 'Producto no encontrado' })
  })

  it('usa el cuerpo string de una HttpException', () => {
    const { host, sent } = capture()
    filter.catch(new ConflictException('Directo'), host)
    expect(sent.status).toBe(409)
    expect(sent.body?.error.message).toBe('Directo')
  })

  it.each(['P2002', 'P2003'])('traduce %s a 409 con mensaje genérico', (code) => {
    const { host, sent } = capture()
    filter.catch(prismaError(code), host)
    expect(sent.status).toBe(409)
    expect(sent.body?.error).toEqual({ code: 'CONFLICT', message: 'Conflicto con los datos existentes' })
  })

  it('traduce P2025 a 404', () => {
    const { host, sent } = capture()
    filter.catch(prismaError('P2025'), host)
    expect(sent.status).toBe(404)
    expect(sent.body?.error).toEqual({ code: 'NOT_FOUND', message: 'Registro no encontrado' })
  })

  it.each([
    ['error Prisma desconocido', prismaError('P9999')],
    ['error no HTTP', new Error('falló')],
    ['valor no Error', 'falló'],
  ])('devuelve 500 ante %s', (_caso, exception) => {
    const { host, sent } = capture()
    filter.catch(exception, host)
    expect(sent.status).toBe(500)
    expect(sent.body?.error).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor' })
  })
})
