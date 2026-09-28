import { HttpException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { AppError, unexpected } from '../../common/result/app-error'
import { Result, andThenAsync, err, fromPromise, isErr, map, ok } from '../../common/result/result'
import { Transaccion } from '../../transacciones/domain/transaccion'
import { PayDto } from '../dto/pay.dto'
import { PaymentGatewayPort, ProviderPayment } from '../ports/payment-gateway.port'
import { PaymentOrdersPort } from '../ports/payment-orders.port'

type Order = NonNullable<Awaited<ReturnType<PaymentOrdersPort['get']>>>

function providerError(cause: unknown): AppError {
  return cause instanceof HttpException
    ? { kind: 'PaymentProviderError', message: cause.message, httpStatus: cause.getStatus() }
    : { kind: 'PaymentProviderError', message: 'Error interno del servidor', httpStatus: 500 }
}

@Injectable()
export class PaymentsUseCases {
  private readonly logger = new Logger(PaymentsUseCases.name)
  constructor(private readonly gateway: PaymentGatewayPort, private readonly orders: PaymentOrdersPort,
    private readonly config: ConfigService) {}

  async terms() {
    const documents = await fromPromise(() => Promise.all([this.gateway.terms(), this.gateway.tokenizationKey()]), providerError)
    return andThenAsync(documents, async ([{ privacy, personal }, tokenizationKey]) => fromPromise(async () => ({
      privacy, personal, tokenizationKey, publicKey: this.config.getOrThrow<string>('WOMPI_PUBLIC_KEY'),
      sandboxUrl: this.config.getOrThrow<string>('WOMPI_SANDBOX_URL'),
    }), unexpected))
  }

  async tokenize(payload: string) {
    return map(await fromPromise(() => this.gateway.tokenizeCard(payload), providerError), (token) => ({ token }))
  }

  private async order(id: number, key: string): Promise<Result<Order, AppError>> {
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      return err({ kind: 'Validation', message: 'Idempotency-Key inválida' })
    }
    const found = await fromPromise(() => this.orders.get(id), unexpected)
    if (isErr(found)) return found
    if (!found.value || found.value.referencia !== createHash('sha256').update(`checkout:${key}`).digest('hex')) {
      return err({ kind: 'NotFound', message: 'Transacción no encontrada' })
    }
    return ok(found.value)
  }

  private async synchronize(id: number, reference: string, amountInCents: number,
    external: ProviderPayment): Promise<Result<Transaccion, AppError>> {
    if (external.reference !== reference || external.amountInCents !== amountInCents || external.currency !== 'COP') {
      return err({ kind: 'Conflict', message: 'Respuesta de pago no coincide con la orden; requiere conciliación' })
    }
    this.logger.log(`transactionId=${id} reference=${reference} externalTransactionId=${external.id} status=${external.status}`)
    const status = external.status
    if (status === 'PENDING') {
      const found = await fromPromise(() => this.orders.get(id), unexpected)
      if (isErr(found)) return found
      if (!found.value) return err({ kind: 'NotFound', message: 'Transacción no encontrada' })
      const { email: _email, ...safe } = found.value
      void _email
      return ok(safe)
    }
    return fromPromise(() => this.orders.settle(id, status), unexpected)
  }

  async pay(id: number, key: string, input: PayDto): Promise<Result<Transaccion, AppError>> {
    return andThenAsync(await this.order(id, key), async (order) => {
      if (order.estado !== 'PENDIENTE' || order.idTransaccionExterna) return this.check(id, key)
      return andThenAsync(await fromPromise(() => this.gateway.terms(), providerError), async (terms) => {
        if (terms.privacy !== input.privacyDocument || terms.personal !== input.personalDocument) {
          return err<AppError>({ kind: 'Conflict', message: 'Los documentos de aceptación han cambiado; revísalos nuevamente' })
        }
        const reserved = await fromPromise(() => this.orders.reserve(id, {
          address: input.address, city: input.city, department: input.department, postalCode: input.postalCode,
        }), unexpected)
        return andThenAsync(reserved, async (didReserve): Promise<Result<Transaccion, AppError>> => {
          if (!didReserve) return this.check(id, key)
          const amountInCents = Math.round(Number(order.total) * 100)
          const payment = await fromPromise(() => this.gateway.create({ reference: order.referencia, amountInCents,
            email: order.email, cardToken: input.cardToken, installments: input.installments, terms }), providerError)
          return andThenAsync(payment, async (external): Promise<Result<Transaccion, AppError>> => {
            if (external.reference !== order.referencia || external.amountInCents !== amountInCents || external.currency !== 'COP') {
              return err({ kind: 'Conflict', message: 'Respuesta de pago no coincide con la orden; requiere conciliación' })
            }
            const attached = await fromPromise(() => this.orders.attachExternal(id, external.id), unexpected)
            return andThenAsync(attached, async () => this.synchronize(id, order.referencia, amountInCents, external))
          })
        })
      })
    })
  }

  async check(id: number, key: string): Promise<Result<Transaccion, AppError>> {
    return andThenAsync(await this.order(id, key), async (order) => {
      const externalId = order.idTransaccionExterna
      if (order.estado !== 'PENDIENTE' || !externalId) {
        const { email: _email, ...safe } = order
        void _email
        return ok(safe)
      }
      const payment = await fromPromise(() => this.gateway.get(externalId), providerError)
      return andThenAsync(payment, async (external): Promise<Result<Transaccion, AppError>> => {
        if (external.id !== externalId) return err({ kind: 'Conflict', message: 'Identificador externo no coincide' })
        return this.synchronize(id, order.referencia, Math.round(Number(order.total) * 100), external)
      })
    })
  }
}
