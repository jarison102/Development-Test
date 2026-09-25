import { Module } from '@nestjs/common'
import { PrismaModule } from '../database/prisma.module'
import { PaymentsUseCases } from './application/payments.use-cases'
import { SandboxPaymentAdapter } from './infrastructure/sandbox-payment.adapter'
import { PrismaPaymentOrdersRepository } from './infrastructure/prisma-payment-orders.repository'
import { PaymentsController } from './payments.controller'
import { PaymentGatewayPort } from './ports/payment-gateway.port'
import { PaymentOrdersPort } from './ports/payment-orders.port'

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsUseCases,
    { provide: PaymentGatewayPort, useClass: SandboxPaymentAdapter },
    { provide: PaymentOrdersPort, useClass: PrismaPaymentOrdersRepository }],
})
export class PaymentsModule {}
