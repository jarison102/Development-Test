import { createHash } from 'node:crypto'
import { integritySignature } from './integrity'

test('firma referencia, centavos, COP y secreto en el orden exigido', () => {
  const expected = createHash('sha256').update('order-150000COPtest-placeholder').digest('hex')
  expect(integritySignature('order-1', 50000, 'test-placeholder')).toBe(expected)
  expect(integritySignature('order-1', 50001, 'test-placeholder')).not.toBe(expected)
})

test('rechaza importes no enteros', () => {
  expect(() => integritySignature('order-1', 1.5, 'test-placeholder')).toThrow()
})
