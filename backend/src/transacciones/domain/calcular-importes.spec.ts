import { calcularImportes } from './calcular-importes'

describe('calcularImportes', () => {
  it('calcula centavos sin errores de punto flotante', () => {
    expect(calcularImportes('250000.25', 2)).toEqual({
      subtotal: '500000.50',
      tarifaBase: '1500.00',
      tarifaEnvio: '5000.00',
      total: '506500.50',
    })
  })

  it('rechaza cantidad y precios inválidos', () => {
    expect(() => calcularImportes('250000.00', 0)).toThrow(RangeError)
    expect(() => calcularImportes('abc', 1)).toThrow(RangeError)
  })

  it('rechaza importes que no caben en decimal(12,2)', () => {
    expect(() => calcularImportes('9999999999.99', 2)).toThrow(RangeError)
  })
})
