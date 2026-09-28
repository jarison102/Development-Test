export type AppError =
  | { kind: 'NotFound'; message: string }
  | { kind: 'Conflict'; message: string }
  | { kind: 'Validation'; message: string }
  | { kind: 'StockInsuficiente'; message: string }
  | { kind: 'PaymentDeclined'; message: string }
  | { kind: 'PaymentProviderError'; message: string }
  | { kind: 'Unexpected'; message: string; cause?: unknown }

export const unexpected = (cause: unknown): AppError => ({ kind: 'Unexpected', message: 'Error interno del servidor', cause })
