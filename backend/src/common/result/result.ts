export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok

export function map<T, E, U>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(transform(result.value)) : result
}

export function mapErr<T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(transform(result.error)) : result
}

export function andThen<T, E, U, F>(result: Result<T, E>, transform: (value: T) => Result<U, F>): Result<U, E | F> {
  return isOk(result) ? transform(result.value) : result
}

export async function andThenAsync<T, E, U, F>(result: Result<T, E>, transform: (value: T) => Promise<Result<U, F>>): Promise<Result<U, E | F>> {
  return isOk(result) ? transform(result.value) : result
}

export function match<T, E, U>(result: Result<T, E>, branches: { ok: (value: T) => U; err: (error: E) => U }): U {
  return isOk(result) ? branches.ok(result.value) : branches.err(result.error)
}

export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (isErr(result)) return result
    values.push(result.value)
  }
  return ok(values)
}

export const all = combine
