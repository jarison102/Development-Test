import { Module } from '@nestjs/common'
import { ClientesModule } from '../clientes/clientes.module'
import { PrismaModule } from '../database/prisma.module'
import { TransaccionesModule } from '../transacciones/transacciones.module'
import { CrearEntrega } from './application/crear-entrega.use-case'
import { EntregasPort } from './domain/entregas.port'
import { EntregasController } from './entregas.controller'
import { PrismaEntregasRepository } from './infrastructure/prisma-entregas.repository'

@Module({
  imports: [PrismaModule, ClientesModule, TransaccionesModule],
  controllers: [EntregasController],
  providers: [CrearEntrega, { provide: EntregasPort, useClass: PrismaEntregasRepository }],
})
export class EntregasModule {}
