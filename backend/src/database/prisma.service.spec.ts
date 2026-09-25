import { ConfigService } from '@nestjs/config'
import { PrismaService } from './prisma.service'

const config = { getOrThrow: (name: string) => {
  if (name !== 'DATABASE_URL') throw new Error(`Falta ${name}`)
  return 'mysql://user:pass@127.0.0.1:3306/payment_checkout'
} } as unknown as ConfigService

describe('PrismaService', () => {
  it('conecta al iniciar el módulo y desconecta al destruirlo', async () => {
    const service = new PrismaService(config)
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined)
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined)
    await service.onModuleInit()
    await service.onModuleDestroy()
    expect(connect).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('exige DATABASE_URL en la configuración', () => {
    const missing = { getOrThrow: () => { throw new Error('Falta DATABASE_URL') } } as unknown as ConfigService
    expect(() => new PrismaService(missing)).toThrow('DATABASE_URL')
  })
})
