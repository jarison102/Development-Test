import { Body, Controller, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CrearCliente } from './application/crear-cliente.use-case'
import { CrearClienteDto } from './dto/crear-cliente.dto'

@ApiTags('clientes')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly crear: CrearCliente) {}

  @Post()
  @ApiOperation({ summary: 'Registrar cliente' })
  @ApiResponse({ status: 201, description: '{ data: Cliente }' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o propiedades no admitidas' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado' })
  async create(@Body() body: CrearClienteDto) {
    return { data: await this.crear.execute(body) }
  }
}
