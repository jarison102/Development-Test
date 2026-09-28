import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IdParamDto } from '../common/http/id-param.dto'
import { toHttp } from '../common/http/result-to-http'
import { CotizarTransaccion, CrearTransaccion, ObtenerTransaccion } from './application/transacciones.use-cases'
import { CotizarTransaccionDto } from './dto/cotizar-transaccion.dto'
import { CrearTransaccionDto } from './dto/crear-transaccion.dto'

@ApiTags('transacciones')
@Controller('transacciones')
export class TransaccionesController {
  constructor(
    private readonly crear: CrearTransaccion,
    private readonly obtener: ObtenerTransaccion,
    private readonly cotizar: CotizarTransaccion,
  ) {}

  @Post('cotizar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcular importes sin crear transacción; se recalculan al confirmar' })
  @ApiResponse({ status: 200, description: '{ data: { items?, subtotal, tarifaBase, tarifaEnvio, total } }; cotiza items o productoId/cantidad' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o importes enviados por el cliente' })
  @ApiResponse({ status: 404, description: 'Producto inexistente' })
  @ApiResponse({ status: 409, description: 'Stock insuficiente' })
  async quote(@Body() body: CotizarTransaccionDto) {
    return toHttp(await this.cotizar.execute(body))
  }

  @Post()
  @ApiOperation({ summary: 'Crear transacción PENDIENTE con uno o varios artículos, sin descontar stock' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'UUID v4 para reintentos seguros' })
  @ApiResponse({ status: 201, description: '{ data: Transaccion }; importes decimales calculados por el servidor' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o importes enviados por el cliente' })
  @ApiResponse({ status: 404, description: 'Producto o cliente inexistente' })
  @ApiResponse({ status: 409, description: 'Stock insuficiente o importe fuera de rango' })
  async create(@Body() body: CrearTransaccionDto, @Headers('idempotency-key') key?: string) {
    return toHttp(await this.crear.execute(body, key))
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar estado e importes de una transacción' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: '{ data: Transaccion }' })
  @ApiResponse({ status: 400, description: 'ID inválido' })
  @ApiResponse({ status: 404, description: 'Transacción inexistente' })
  async findOne(@Param() params: IdParamDto) {
    return toHttp(await this.obtener.execute(params.id))
  }
}
