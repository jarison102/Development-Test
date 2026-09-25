export type PaymentStatus = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING'
export type ProviderPayment = { id: string; reference: string; amountInCents: number; currency: string; status: PaymentStatus }
export type Terms = { privacy: string; personal: string; acceptanceToken: string; personalToken: string }

export abstract class PaymentGatewayPort {
  abstract terms(): Promise<Terms>
  abstract create(input: {
    reference: string; amountInCents: number; email: string; cardToken: string; installments: number; terms: Terms
  }): Promise<ProviderPayment>
  abstract get(id: string): Promise<ProviderPayment>
}
