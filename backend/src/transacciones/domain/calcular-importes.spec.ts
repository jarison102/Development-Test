import { isErr, ok } from '../../common/result/result'
import { calcularImportes, calcularImportesItems } from './calcular-importes'

describe('calcularImportes', () => {
  it('calcula centavos sin errores de punto flotante', () => {
    expect(calcularImportes('250000.25', 2)).toEqual(ok({
      subtotal: '500000.50',
      tarifaBase: '1500.00',
      tarifaEnvio: '5000.00',
      total: '506500.50',
    }))
  })

  it('rechaza cantidad y precios inválidos como valores', () => {
    expect(isErr(calcularImportes('250000.00', 0))).toBe(true)
    expect(calcularImportes('abc', 1)).toMatchObject({ error: { kind: 'Conflict' } })
  })

  it('rechaza importes que no caben en decimal(12,2)', () => {
    expect(calcularImportes('9999999999.99', 2)).toMatchObject({ error: { kind: 'Conflict' } })
  })

  it('agrega artículos sin alterar tarifas y falla si alguno no es válido', () => {
    expect(calcularImportesItems([{ precio: '250000.25', cantidad: 2 }])).toMatchObject({
      ok: true, value: { subtotal: '500000.50', total: '506500.50', subtotals: ['500000.50'] },
    })
    expect(isErr(calcularImportesItems([{ precio: 'abc', cantidad: 1 }]))).toBe(true)
    expect(isErr(calcularImportesItems([]))).toBe(true)
  })
})
