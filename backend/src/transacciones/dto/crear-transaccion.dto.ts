import { ApiProperty } from '@nestjs/swagger'
import { IsInt, Min } from 'class-validator'
import { CotizarTransaccionDto } from './cotizar-transaccion.dto'

export class CrearTransaccionDto extends CotizarTransaccionDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt() @Min(1)
  clienteId!: number
}
