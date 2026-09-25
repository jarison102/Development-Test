import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ClientesModule } from './clientes/clientes.module'
import { EntregasModule } from './entregas/entregas.module'
import { ProductosModule } from './productos/productos.module'
import { TransaccionesModule } from './transacciones/transacciones.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env: Record<string, unknown>) => {
        const url = String(env.DATABASE_URL ?? '')
        if (!url.startsWith('mysql://') || !env.FRONTEND_ORIGIN) {
          throw new Error('Configura DATABASE_URL (MySQL) y FRONTEND_ORIGIN')
        }
        return env
      },
    }),
    ProductosModule,
    ClientesModule,
    TransaccionesModule,
    EntregasModule,
  ],
})
export class AppModule {}
