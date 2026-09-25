import { Module } from '@nestjs/common'
import { PrismaModule } from '../database/prisma.module'
import { CrearCliente } from './application/crear-cliente.use-case'
import { ClientesController } from './clientes.controller'
import { ClientesPort } from './domain/clientes.port'
import { PrismaClientesRepository } from './infrastructure/prisma-clientes.repository'

@Module({
  imports: [PrismaModule],
  controllers: [ClientesController],
  providers: [CrearCliente, { provide: ClientesPort, useClass: PrismaClientesRepository }],
  exports: [ClientesPort],
})
export class ClientesModule {}
