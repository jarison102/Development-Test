import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { errorMessage } from '../services/api'
import { createCustomer } from '../services/clientes.service'
import { quoteTransaction } from '../services/transacciones.service'
import type { CheckoutStep, Customer, Delivery, PurchaseSummary } from '../types/checkout'
import type { RootState } from './store'

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

export type CheckoutState = {
  quantity: number
  customer: Customer
  delivery: Delivery
  step: CheckoutStep
  clientId: number | null
  clientStatus: RequestStatus
  clientError: string | null
  quote: PurchaseSummary | null
  quoteStatus: RequestStatus
  quoteError: string | null
  quoteRequestId: string | null
  idempotencyKey: string | null
  acceptedDocuments: { privacy: string; personal: string } | null
  privacyAccepted: boolean
  personalAccepted: boolean
}

export const initialCheckoutState: CheckoutState = {
  quantity: 1,
  customer: { name: '', email: '', phone: '' },
  delivery: { address: '', city: '', department: '', postalCode: '' },
  step: 'producto',
  clientId: null, clientStatus: 'idle', clientError: null,
  quote: null, quoteStatus: 'idle', quoteError: null, quoteRequestId: null,
  idempotencyKey: null,
  acceptedDocuments: null, privacyAccepted: false, personalAccepted: false,
}

export const registerCustomer = createAsyncThunk<number, void, { state: RootState; rejectValue: string }>(
  'checkout/registerCustomer', async (_, { getState, rejectWithValue }) => {
    try { return await createCustomer(getState().checkout.customer) }
    catch (error) { return rejectWithValue(errorMessage(error)) }
  },
  { condition: (_, { getState }) => !getState().checkout.clientId && getState().checkout.clientStatus !== 'loading' },
)

export const fetchQuote = createAsyncThunk<PurchaseSummary, { productId: number; quantity: number }, { rejectValue: string }>(
  'checkout/fetchQuote', async ({ productId, quantity }, { rejectWithValue }) => {
    try { return await quoteTransaction(productId, quantity) }
    catch (error) { return rejectWithValue(errorMessage(error)) }
  },
)

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState: initialCheckoutState,
  reducers: {
    setQuantity(state, action: PayloadAction<number>) {
      if (Number.isSafeInteger(action.payload) && action.payload > 0 && state.quantity !== action.payload) {
        state.quantity = action.payload
        state.idempotencyKey = null
        state.quote = null
        state.quoteStatus = 'idle'
      }
    },
    updateCustomer(state, action: PayloadAction<Partial<Customer>>) {
      const { name, email, phone } = action.payload
      if (typeof name === 'string') state.customer.name = name
      if (typeof email === 'string') state.customer.email = email
      if (typeof phone === 'string') state.customer.phone = phone
      state.clientId = null
      state.idempotencyKey = null
      state.clientStatus = 'idle'
      state.clientError = null
    },
    updateDelivery(state, action: PayloadAction<Partial<Delivery>>) {
      const { address, city, department, postalCode } = action.payload
      if (typeof address === 'string') state.delivery.address = address
      if (typeof city === 'string') state.delivery.city = city
      if (typeof department === 'string') state.delivery.department = department
      if (typeof postalCode === 'string') state.delivery.postalCode = postalCode
    },
    setAcceptanceDocuments(state, action: PayloadAction<{ privacy: string; personal: string }>) {
      if (state.acceptedDocuments?.privacy !== action.payload.privacy
        || state.acceptedDocuments?.personal !== action.payload.personal) {
        state.privacyAccepted = false
        state.personalAccepted = false
      }
      state.acceptedDocuments = action.payload
    },
    acceptPrivacy(state, action: PayloadAction<boolean>) { state.privacyAccepted = action.payload },
    acceptPersonal(state, action: PayloadAction<boolean>) { state.personalAccepted = action.payload },
    setStep(state, action: PayloadAction<CheckoutStep>) { state.step = action.payload },
    setIdempotencyKey(state, action: PayloadAction<string>) { state.idempotencyKey = action.payload },
    resetCheckout() { return initialCheckoutState },
  },
  extraReducers: (builder) => {
    builder
      .addCase(registerCustomer.pending, (state) => { state.clientStatus = 'loading'; state.clientError = null })
      .addCase(registerCustomer.fulfilled, (state, action) => { state.clientId = action.payload; state.clientStatus = 'succeeded' })
      .addCase(registerCustomer.rejected, (state, action) => {
        if (action.meta.condition) return
        state.clientStatus = 'failed'
        state.clientError = action.payload ?? 'No se pudo registrar el cliente.'
      })
      .addCase(fetchQuote.pending, (state, action) => {
        state.quote = null
        state.quoteStatus = 'loading'
        state.quoteError = null
        state.quoteRequestId = action.meta.requestId
      })
      .addCase(fetchQuote.fulfilled, (state, action) => {
        if (state.quoteRequestId !== action.meta.requestId || state.quantity !== action.payload.quantity) return
        state.quote = action.payload
        state.quoteStatus = 'succeeded'
      })
      .addCase(fetchQuote.rejected, (state, action) => {
        if (state.quoteRequestId !== action.meta.requestId) return
        state.quoteStatus = 'failed'
        state.quoteError = action.payload ?? 'No se pudo calcular el resumen.'
      })
  },
})

export const { setQuantity, updateCustomer, updateDelivery, setAcceptanceDocuments, acceptPrivacy, acceptPersonal,
  setStep, setIdempotencyKey, resetCheckout } = checkoutSlice.actions
export default checkoutSlice.reducer
