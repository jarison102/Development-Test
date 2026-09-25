import { createHash } from 'node:crypto'

export function integritySignature(reference: string, amountInCents: number, secret: string): string {
  if (!reference || !Number.isSafeInteger(amountInCents) || amountInCents <= 0 || !secret) {
    throw new Error('Datos de firma inválidos')
  }
  return createHash('sha256').update(`${reference}${amountInCents}COP${secret}`).digest('hex')
}
