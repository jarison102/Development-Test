import { Equals, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator'

export class TokenizeDto {
  @Matches(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/)
  @MaxLength(8192)
  payload!: string
}

export class PayDto {
  @Matches(/^tok_(?!prod_)[a-zA-Z0-9_-]{1,150}$/)
  cardToken!: string

  @IsInt()
  @Min(1)
  @Max(36)
  installments!: number

  @Equals(true)
  acceptPrivacy!: boolean

  @Equals(true)
  acceptPersonal!: boolean

  @IsUrl({ require_protocol: true, protocols: ['https'] })
  privacyDocument!: string

  @IsUrl({ require_protocol: true, protocols: ['https'] })
  personalDocument!: string

  @IsString()
  @MaxLength(250)
  address!: string

  @IsString()
  @MaxLength(100)
  city!: string

  @IsString()
  @MaxLength(100)
  department!: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string
}
