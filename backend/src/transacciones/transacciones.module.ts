import { Module } from '@nestjs/common'
import { ClientesModule } from '../clientes/clientes.module'
import { PrismaModule } from '../database/prisma.module'
import { ProductosModule } from '../productos/productos.module'
import { CotizarTransaccion, CrearTransaccion, ObtenerTransaccion } from './application/transacciones.use-cases'
import { PrismaTransaccionesRepository } from './infrastructure/prisma-transacciones.repository'
import { TransaccionesController } from './transacciones.controller'
import { TransaccionesPort } from './domain/transacciones.port'

@Module({
  imports: [PrismaModule, ProductosModule, ClientesModule],
  controllers: [TransaccionesController],
  providers: [CotizarTransaccion, CrearTransaccion, ObtenerTransaccion, { provide: TransaccionesPort, useClass: PrismaTransaccionesRepository }],
  exports: [TransaccionesPort],
})
export class TransaccionesModule {}
