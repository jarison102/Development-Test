import '@testing-library/jest-dom'
import { randomUUID } from 'node:crypto'
import { TextDecoder, TextEncoder } from 'node:util'

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder })
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder })
Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true })

if (typeof AbortSignal.timeout !== 'function') {
  Object.defineProperty(AbortSignal, 'timeout', { value: (ms: number) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms)
    ;(timer as unknown as { unref?: () => void }).unref?.()
    return controller.signal
  } })
}
