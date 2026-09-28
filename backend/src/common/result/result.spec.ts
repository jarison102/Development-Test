import { all, andThen, andThenAsync, combine, err, fromPromise, isErr, isOk, map, mapErr, match, ok } from './result'

describe('Result', () => {
  it('distingue éxito y error sin perder tipos', () => {
    expect(isOk(ok(1))).toBe(true)
    expect(isErr(err('falló'))).toBe(true)
  })

  it('map y mapErr transforman solo la rama correspondiente', () => {
    const success = ok(2)
    const failure = err('falló')
    expect(map(success, (value) => value * 2)).toEqual(ok(4))
    expect(map(failure, () => 4)).toBe(failure)
    expect(mapErr(failure, (message) => message.toUpperCase())).toEqual(err('FALLÓ'))
    expect(mapErr(success, () => 'otro')).toBe(success)
  })

  it('andThen y andThenAsync detienen el flujo al primer error', async () => {
    const transform = jest.fn((value: number) => ok(value + 1))
    expect(andThen(ok(1), transform)).toEqual(ok(2))
    expect(andThen(err('falló'), transform)).toEqual(err('falló'))
    expect(transform).toHaveBeenCalledTimes(1)
    const asyncTransform = jest.fn(async (value: number) => ok(value + 1))
    expect(await andThenAsync(ok(2), asyncTransform)).toEqual(ok(3))
    expect(await andThenAsync(err('falló'), asyncTransform)).toEqual(err('falló'))
    expect(asyncTransform).toHaveBeenCalledTimes(1)
  })

  it('combine y all agrupan éxitos o devuelven el primer error', () => {
    expect(combine([ok(1), ok(2)])).toEqual(ok([1, 2]))
    expect(all([ok(1), err('falló'), err('otro')])).toEqual(err('falló'))
  })

  it('fromPromise convierte fallos del adaptador en valores de error', async () => {
    expect(await fromPromise(async () => 2, () => 'error')).toEqual(ok(2))
    expect(await fromPromise(async () => { throw new Error('falló') }, () => 'error')).toEqual(err('error'))
  })

  it('match resuelve ambas ramas', () => {
    const branches = { ok: (value: number) => `ok: ${value}`, err: (error: string) => `err: ${error}` }
    expect(match(ok(1), branches)).toBe('ok: 1')
    expect(match(err('falló'), branches)).toBe('err: falló')
  })
})
