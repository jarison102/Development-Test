import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{ status: (code: number) => { send: (body: object) => void } }>()
    const status = exception instanceof HttpException ? exception.getStatus()
      : exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.code === 'P2002' || exception.code === 'P2003' ? HttpStatus.CONFLICT
          : exception.code === 'P2025' ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR
        : HttpStatus.INTERNAL_SERVER_ERROR
    const body = exception instanceof HttpException ? exception.getResponse() : null
    const message = typeof body === 'string' ? body
      : body && typeof body === 'object' && 'message' in body
        ? (body as { message: string | string[] }).message
        : status === HttpStatus.CONFLICT ? 'Conflicto con los datos existentes'
          : status === HttpStatus.NOT_FOUND ? 'Registro no encontrado' : 'Error interno del servidor'
    const code = HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR'
    response.status(status).send({ error: { code, message } })
  }
}
