import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, Min, ValidateIf, ValidateNested } from 'class-validator'

export class ItemTransaccionDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt() @Min(1)
  productoId!: number

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt() @Min(1)
  cantidad!: number
}

export class CotizarTransaccionDto {
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @ValidateIf((value: CotizarTransaccionDto) => value.items === undefined)
  @IsInt() @Min(1)
  productoId?: number

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @ValidateIf((value: CotizarTransaccionDto) => value.items === undefined)
  @IsInt() @Min(1)
  cantidad?: number

  @ApiPropertyOptional({ type: [ItemTransaccionDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => ItemTransaccionDto)
  items?: ItemTransaccionDto[]
}
