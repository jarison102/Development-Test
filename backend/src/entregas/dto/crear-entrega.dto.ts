import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CrearEntregaDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  transaccionId!: number

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  clienteId!: number

  @ApiProperty({ maxLength: 250 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  direccion!: string

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ciudad!: string

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  departamento!: string

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoPostal?: string | null
}
