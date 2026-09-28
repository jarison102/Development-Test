import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IdParamDto } from '../common/http/id-param.dto'
import { toHttp } from '../common/http/result-to-http'
import { ListarProductos, ObtenerProducto } from './application/productos.use-cases'

@ApiTags('productos')
@Controller('productos')
export class ProductosController {
  constructor(private readonly listar: ListarProductos, private readonly obtener: ObtenerProducto) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos activos' })
  @ApiResponse({ status: 200, description: '{ data: Producto[] }; precios como strings decimales' })
  async findAll() {
    return toHttp(await this.listar.execute())
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar producto activo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: '{ data: Producto }' })
  @ApiResponse({ status: 400, description: 'ID inválido' })
  @ApiResponse({ status: 404, description: 'Producto inexistente o inactivo' })
  async findOne(@Param() params: IdParamDto) {
    return toHttp(await this.obtener.execute(params.id))
  }
}
