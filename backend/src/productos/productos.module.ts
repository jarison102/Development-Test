import { Module } from '@nestjs/common'
import { PrismaModule } from '../database/prisma.module'
import { ListarProductos, ObtenerProducto } from './application/productos.use-cases'
import { ProductosPort } from './domain/productos.port'
import { PrismaProductosRepository } from './infrastructure/prisma-productos.repository'
import { ProductosController } from './productos.controller'

@Module({
  imports: [PrismaModule],
  controllers: [ProductosController],
  providers: [ListarProductos, ObtenerProducto, { provide: ProductosPort, useClass: PrismaProductosRepository }],
  exports: [ProductosPort],
})
export class ProductosModule {}
