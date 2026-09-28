import { AppError } from '../../common/result/app-error'
import { Result, combine, err, isErr, map, ok } from '../../common/result/result'

const TARIFA_BASE_CENTAVOS = 150000n
const TARIFA_ENVIO_CENTAVOS = 500000n
const MAX_CENTAVOS = 999999999999n
const invalidAmount: AppError = { kind: 'Conflict', message: 'No se puede calcular el importe de esta compra' }

type Amounts = { subtotal: string; tarifaBase: string; tarifaEnvio: string; total: string }

function moneda(centavos: bigint): string {
  return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`
}

export function calcularImportesItems(items: { precio: string; cantidad: number }[]): Result<Amounts & { subtotals: string[] }, AppError> {
  if (items.length < 1) return err(invalidAmount)
  const subtotals = combine(items.map((item) => map(calcularImportes(item.precio, item.cantidad), (amount) => amount.subtotal)))
  if (isErr(subtotals)) return subtotals
  const cents = subtotals.value.reduce((sum, amount) => {
    const [whole, fraction] = amount.split('.')
    return sum + BigInt(whole) * 100n + BigInt(fraction)
  }, 0n)
  return map(calcularImportes(moneda(cents), 1), (amounts) => ({ subtotals: subtotals.value, ...amounts }))
}

export function calcularImportes(precio: string, cantidad: number): Result<Amounts, AppError> {
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || !/^\d{1,10}\.\d{2}$/.test(precio)) return err(invalidAmount)
  const [entero, decimal] = precio.split('.')
  const subtotal = (BigInt(entero) * 100n + BigInt(decimal)) * BigInt(cantidad)
  const total = subtotal + TARIFA_BASE_CENTAVOS + TARIFA_ENVIO_CENTAVOS
  if (total > MAX_CENTAVOS) return err(invalidAmount)
  return ok({
    subtotal: moneda(subtotal),
    tarifaBase: moneda(TARIFA_BASE_CENTAVOS),
    tarifaEnvio: moneda(TARIFA_ENVIO_CENTAVOS),
    total: moneda(total),
  })
}
