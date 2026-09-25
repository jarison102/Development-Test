import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { PaymentGatewayPort, ProviderPayment } from '../ports/payment-gateway.port'
import { PaymentOrdersPort } from '../ports/payment-orders.port'
import { PayDto } from '../dto/pay.dto'

@Injectable()
export class PaymentsUseCases {
  private readonly logger = new Logger(PaymentsUseCases.name)
  constructor(private readonly gateway: PaymentGatewayPort, private readonly orders: PaymentOrdersPort,
    private readonly config: ConfigService) {}

  async terms() {
    const { privacy, personal } = await this.gateway.terms()
    return { privacy, personal, publicKey: this.config.getOrThrow<string>('WOMPI_PUBLIC_KEY'),
      sandboxUrl: this.config.getOrThrow<string>('WOMPI_SANDBOX_URL') }
  }

  private async order(id: number, key: string) {
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw new BadRequestException('Idempotency-Key inválida')
    }
    const order = await this.orders.get(id)
    if (!order) throw new NotFoundException('Transacción no encontrada')
    if (order.referencia !== createHash('sha256').update(`checkout:${key}`).digest('hex')) {
      throw new NotFoundException('Transacción no encontrada')
    }
    return order
  }

  private async synchronize(id: number, reference: string, amountInCents: number, external: ProviderPayment) {
    if (external.reference !== reference || external.amountInCents !== amountInCents || external.currency !== 'COP') {
      throw new ConflictException('Respuesta de pago no coincide con la orden; requiere conciliación')
    }
    this.logger.log(`transactionId=${id} reference=${reference} externalTransactionId=${external.id} status=${external.status}`)
    if (external.status === 'PENDING') {
      const order = await this.orders.get(id)
      if (!order) throw new NotFoundException('Transacción no encontrada')
      const { email: _email, ...safe } = order
      void _email
      return safe
    }
    return this.orders.settle(id, external.status)
  }

  async pay(id: number, key: string, input: PayDto) {
    const order = await this.order(id, key)
    if (order.estado !== 'PENDIENTE' || order.idTransaccionExterna) return this.check(id, key)
    const terms = await this.gateway.terms()
    if (terms.privacy !== input.privacyDocument || terms.personal !== input.personalDocument) {
      throw new ConflictException('Los documentos de aceptación han cambiado; revísalos nuevamente')
    }
    const reserved = await this.orders.reserve(id, {
      address: input.address, city: input.city, department: input.department, postalCode: input.postalCode,
    })
    if (!reserved) return this.check(id, key)
    const amountInCents = Math.round(Number(order.total) * 100)
    const external = await this.gateway.create({ reference: order.referencia, amountInCents,
      email: order.email, cardToken: input.cardToken, installments: input.installments, terms })
    if (external.reference !== order.referencia || external.amountInCents !== amountInCents || external.currency !== 'COP') {
      throw new ConflictException('Respuesta de pago no coincide con la orden; requiere conciliación')
    }
    await this.orders.attachExternal(id, external.id)
    const result = await this.synchronize(id, order.referencia, amountInCents, external)
    if (!result) throw new NotFoundException('Transacción no encontrada')
    return result
  }

  async check(id: number, key: string) {
    const order = await this.order(id, key)
    if (order.estado !== 'PENDIENTE' || !order.idTransaccionExterna) {
      const { email: _email, ...safe } = order
      void _email
      return safe
    }
    const external = await this.gateway.get(order.idTransaccionExterna)
    if (external.id !== order.idTransaccionExterna) throw new ConflictException('Identificador externo no coincide')
    const result = await this.synchronize(id, order.referencia, Math.round(Number(order.total) * 100), external)
    if (!result) throw new NotFoundException('Transacción no encontrada')
    return result
  }
}
