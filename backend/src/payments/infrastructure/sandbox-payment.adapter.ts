import { BadGatewayException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { integritySignature } from '../domain/integrity'
import { PaymentGatewayPort, ProviderPayment, Terms } from '../ports/payment-gateway.port'

@Injectable()
export class SandboxPaymentAdapter implements PaymentGatewayPort {
  private readonly url: string
  private readonly publicKey: string
  private readonly privateKey: string
  private readonly integrity: string

  constructor(config: ConfigService) {
    this.url = (config.get<string>('WOMPI_SANDBOX_URL') ?? '').replace(/\/$/, '')
    this.publicKey = config.get<string>('WOMPI_PUBLIC_KEY') ?? ''
    this.privateKey = config.get<string>('WOMPI_PRIVATE_KEY') ?? ''
    this.integrity = config.get<string>('WOMPI_INTEGRITY_SECRET') ?? ''
  }

  private ensureSandbox() {
    const publicSandbox = this.url === 'https://sandbox.wompi.co/v1'
      && this.publicKey.startsWith('pub_test_') && this.privateKey.startsWith('prv_test_')
      && this.integrity.startsWith('test_integrity_')
    const testUat = this.url === 'https://api-sandbox.co.uat.wompi.dev/v1'
      && this.publicKey.startsWith('pub_stagtest_') && this.privateKey.startsWith('prv_stagtest_')
      && this.integrity.startsWith('stagtest_integrity_')
    if (!publicSandbox && !testUat) throw new BadGatewayException('Configura Wompi Sandbox con llaves de prueba del mismo ambiente')
  }

  private async request(path: string, key: string, options: RequestInit = {}): Promise<unknown> {
    try {
      const response = await fetch(`${this.url}${path}`, {
        ...options, signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers },
      })
      if (!response.ok) throw new BadGatewayException('Wompi Sandbox no completó la solicitud')
      return (await response.json() as { data?: unknown }).data
    } catch {
      throw new BadGatewayException('No se pudo confirmar la operación con Wompi Sandbox')
    }
  }

  async terms(): Promise<Terms> {
    this.ensureSandbox()
    const response = await fetch(`${this.url}/merchants/info`, {
      signal: AbortSignal.timeout(10000), headers: { 'x-merchant-public-key': this.publicKey },
    }).catch(() => { throw new BadGatewayException('No se pudieron obtener los documentos de Wompi') })
    if (!response.ok) throw new BadGatewayException('No se pudieron obtener los documentos de Wompi')
    const data = (await response.json() as { data: {
      presigned_acceptance: { permalink: string; acceptance_token: string }
      presigned_personal_data_auth: { permalink: string; acceptance_token: string }
    } }).data
    const privacy = data?.presigned_acceptance
    const personal = data?.presigned_personal_data_auth
    if (!privacy?.permalink?.startsWith('https://') || !personal?.permalink?.startsWith('https://')
      || !privacy.acceptance_token || !personal.acceptance_token) throw new BadGatewayException('Documentos de Wompi inválidos')
    return { privacy: privacy.permalink, personal: personal.permalink,
      acceptanceToken: privacy.acceptance_token, personalToken: personal.acceptance_token }
  }

  private parse(data: unknown): ProviderPayment {
    const raw = data as { id: string; reference: string; amount_in_cents: number; currency: string; status: string }
    if (!raw || typeof raw.id !== 'string' || typeof raw.reference !== 'string'
      || !Number.isSafeInteger(raw.amount_in_cents) || raw.currency !== 'COP'
      || !['APPROVED', 'DECLINED', 'VOIDED', 'ERROR', 'PENDING'].includes(raw.status)) {
      throw new BadGatewayException('Estado de Wompi desconocido')
    }
    return { id: raw.id, reference: raw.reference, amountInCents: raw.amount_in_cents,
      currency: raw.currency, status: raw.status as ProviderPayment['status'] }
  }

  async tokenizationKey(): Promise<string> {
    this.ensureSandbox()
    const data = await this.request('/tokens/keys/tokenization', this.publicKey) as { publicKey?: string }
    if (typeof data?.publicKey !== 'string' || !data.publicKey.includes('BEGIN PUBLIC KEY')) {
      throw new BadGatewayException('Llave de tokenización de Wompi inválida')
    }
    return data.publicKey
  }

  async tokenizeCard(payload: string): Promise<string> {
    this.ensureSandbox()
    const data = await this.request('/tokens/cards', this.publicKey, {
      method: 'POST', body: JSON.stringify({ payload }),
    }) as { id?: string }
    if (typeof data?.id !== 'string' || !/^tok_(?!prod_)[a-zA-Z0-9_-]+$/.test(data.id)) {
      throw new BadGatewayException('Wompi no devolvió un token de tarjeta válido')
    }
    return data.id
  }

  async create(input: { reference: string; amountInCents: number; email: string; cardToken: string; installments: number; terms: Terms }) {
    this.ensureSandbox()
    const body = {
      amount_in_cents: input.amountInCents, currency: 'COP', customer_email: input.email,
      payment_method: { type: 'CARD', token: input.cardToken, installments: input.installments },
      payment_method_type: 'CARD', reference: input.reference,
      signature: integritySignature(input.reference, input.amountInCents, this.integrity),
      acceptance_token: input.terms.acceptanceToken, accept_personal_auth: input.terms.personalToken,
    }
    return this.parse(await this.request('/transactions', this.privateKey, { method: 'POST', body: JSON.stringify(body) }))
  }

  async get(id: string) {
    this.ensureSandbox()
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new BadGatewayException('Identificador externo inválido')
    return this.parse(await this.request(`/transactions/${id}`, this.privateKey))
  }
}
