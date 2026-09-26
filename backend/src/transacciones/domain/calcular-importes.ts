const TARIFA_BASE_CENTAVOS = 150000n
const TARIFA_ENVIO_CENTAVOS = 500000n
const MAX_CENTAVOS = 999999999999n

function moneda(centavos: bigint): string {
  return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`
}

export function calcularImportesItems(items: { precio: string; cantidad: number }[]) {
  if (items.length < 1) throw new RangeError('La compra debe incluir artículos')
  const subtotals = items.map((item) => calcularImportes(item.precio, item.cantidad).subtotal)
  const cents = subtotals.reduce((sum, amount) => {
    const [whole, fraction] = amount.split('.')
    return sum + BigInt(whole) * 100n + BigInt(fraction)
  }, 0n)
  return { subtotals, ...calcularImportes(moneda(cents), 1) }
}

export function calcularImportes(precio: string, cantidad: number) {
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || !/^\d{1,10}\.\d{2}$/.test(precio)) {
    throw new RangeError('Cantidad o precio inválidos')
  }
  const [entero, decimal] = precio.split('.')
  const subtotal = (BigInt(entero) * 100n + BigInt(decimal)) * BigInt(cantidad)
  const total = subtotal + TARIFA_BASE_CENTAVOS + TARIFA_ENVIO_CENTAVOS
  if (total > MAX_CENTAVOS) throw new RangeError('El total supera la capacidad de la base de datos')
  return {
    subtotal: moneda(subtotal),
    tarifaBase: moneda(TARIFA_BASE_CENTAVOS),
    tarifaEnvio: moneda(TARIFA_ENVIO_CENTAVOS),
    total: moneda(total),
  }
}
