import { Body, Controller, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CrearEntrega } from './application/crear-entrega.use-case'
import { CrearEntregaDto } from './dto/crear-entrega.dto'

@ApiTags('entregas')
@Controller('entregas')
export class EntregasController {
  constructor(private readonly crear: CrearEntrega) {}

  @Post()
  @ApiOperation({ summary: 'Asociar entrega pendiente a una transacción aprobada' })
  @ApiResponse({ status: 201, description: '{ data: Entrega }' })
  @ApiResponse({ status: 400, description: 'Dirección o IDs inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente o transacción inexistente' })
  @ApiResponse({ status: 409, description: 'Transacción no aprobada, cliente ajeno o entrega duplicada' })
  async create(@Body() body: CrearEntregaDto) {
    return { data: await this.crear.execute(body) }
  }
}
