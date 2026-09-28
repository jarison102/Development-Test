import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IdParamDto } from '../common/http/id-param.dto'
import { toHttp } from '../common/http/result-to-http'
import { PaymentsUseCases } from './application/payments.use-cases'
import { PayDto, TokenizeDto } from './dto/pay.dto'

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsUseCases) {}

  @Get('terms')
  @ApiOperation({ summary: 'Documentos vigentes y configuración pública de Wompi Sandbox' })
  async terms() { return toHttp(await this.payments.terms()) }

  @Post('tokenize')
  @ApiOperation({ summary: 'Reenviar un JWE de tarjeta a Wompi y devolver solo el token' })
  async tokenize(@Body() body: TokenizeDto) {
    return toHttp(await this.payments.tokenize(body.payload))
  }

  @Post(':id')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Procesar una sola vez el pago de una transacción interna PENDIENTE' })
  async pay(@Param() params: IdParamDto, @Headers('idempotency-key') key: string, @Body() body: PayDto) {
    return toHttp(await this.payments.pay(params.id, key, body))
  }

  @Get(':id')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Consultar estado de pago desde el backend y conciliar la orden' })
  async check(@Param() params: IdParamDto, @Headers('idempotency-key') key: string) {
    return toHttp(await this.payments.check(params.id, key))
  }
}
