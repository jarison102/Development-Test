import { ApiProperty } from '@nestjs/swagger'
import { IsInt, Min } from 'class-validator'

export class CotizarTransaccionDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  productoId!: number

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  cantidad!: number
}
