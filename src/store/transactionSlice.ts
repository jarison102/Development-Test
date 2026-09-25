import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { errorMessage } from '../services/api'
import { checkPayment } from '../services/payments.service'
import { createTransaction, getTransaction } from '../services/transacciones.service'
import type { TransactionRecord, TransactionState } from '../types/transaction'
import { setIdempotencyKey } from './checkoutSlice'
import type { RootState } from './store'

export const initialTransactionState: TransactionState = {
  id: null, reference: null, record: null, creating: false, loading: false, error: null,
}

export const submitTransaction = createAsyncThunk<TransactionRecord, void, { state: RootState; rejectValue: string }>(
  'transaction/create', async (_, { dispatch, getState, rejectWithValue }) => {
    const { product, checkout } = getState()
    if (!product.selectedId || !checkout.clientId || !checkout.quote) {
      return rejectWithValue('Completa el cliente y el resumen antes de confirmar.')
    }
    const key = checkout.idempotencyKey ?? crypto.randomUUID()
    if (!checkout.idempotencyKey) dispatch(setIdempotencyKey(key))
    try { return await createTransaction(product.selectedId, checkout.clientId, checkout.quantity, key) }
    catch (error) { return rejectWithValue(errorMessage(error)) }
  },
  { condition: (_, { getState }) => !getState().transaction.creating && !getState().transaction.id },
)

export const refreshTransaction = createAsyncThunk<TransactionRecord, number, { rejectValue: string }>(
  'transaction/refresh', async (id, { rejectWithValue }) => {
    try { return await getTransaction(id) }
    catch (error) { return rejectWithValue(errorMessage(error)) }
  },
)

export const verifyPayment = createAsyncThunk<TransactionRecord, number, { state: RootState; rejectValue: string }>(
  'transaction/verifyPayment', async (id, { getState, rejectWithValue }) => {
    const key = getState().checkout.idempotencyKey
    if (!key) return rejectWithValue('No se puede verificar el pago sin la clave de la orden.')
    try { return await checkPayment(id, key) }
    catch (error) { return rejectWithValue(errorMessage(error)) }
  },
)

const transactionSlice = createSlice({
  name: 'transaction',
  initialState: initialTransactionState,
  reducers: {
    clearTransaction() { return initialTransactionState },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitTransaction.pending, (state) => { state.creating = true; state.error = null })
      .addCase(submitTransaction.fulfilled, (state, action) => {
        state.creating = false
        state.id = action.payload.id
        state.reference = action.payload.reference
        state.record = action.payload
      })
      .addCase(submitTransaction.rejected, (state, action) => {
        if (action.meta.condition) return
        state.creating = false
        state.error = action.payload ?? 'No se pudo crear la transacción.'
      })
      .addCase(refreshTransaction.pending, (state) => { state.loading = true; state.error = null })
      .addCase(refreshTransaction.fulfilled, (state, action) => {
        if (state.id !== action.payload.id) return
        state.record = action.payload
        state.reference = action.payload.reference
        state.loading = false
      })
      .addCase(refreshTransaction.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'No se pudo consultar la transacción.'
      })
      .addCase(verifyPayment.pending, (state) => { state.loading = true; state.error = null })
      .addCase(verifyPayment.fulfilled, (state, action) => {
        if (state.id !== action.payload.id) return
        state.record = action.payload
        state.loading = false
      })
      .addCase(verifyPayment.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'No se pudo verificar el pago.'
      })
  },
})

export const { clearTransaction } = transactionSlice.actions
export default transactionSlice.reducer
