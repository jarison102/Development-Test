import { BadGatewayException, BadRequestException, ConflictException, HttpException,
  HttpStatus, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AppError } from '../result/app-error'
import { Result, isErr } from '../result/result'

function toException(error: AppError): HttpException {
  switch (error.kind) {
    case 'NotFound': return new NotFoundException(error.message)
    case 'Conflict':
    case 'StockInsuficiente': return new ConflictException(error.message)
    case 'Validation': return new BadRequestException(error.message)
    case 'PaymentDeclined': return new HttpException(error.message, HttpStatus.PAYMENT_REQUIRED)
    case 'PaymentProviderError': return error.httpStatus && error.httpStatus !== HttpStatus.BAD_GATEWAY
      ? new HttpException(error.message, error.httpStatus) : new BadGatewayException(error.message)
    case 'Unexpected': {
      if (error.cause instanceof HttpException) return error.cause
      if (error.cause instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.cause.code === 'P2002' || error.cause.code === 'P2003') return new ConflictException('Conflicto con los datos existentes')
        if (error.cause.code === 'P2025') return new NotFoundException('Registro no encontrado')
      }
      return new InternalServerErrorException(error.message)
    }
  }
}

export function toHttp<T>(result: Result<T, AppError>): { data: T } {
  if (isErr(result)) throw toException(result.error)
  return { data: result.value }
}
