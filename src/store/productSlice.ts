import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { errorMessage } from '../services/api'
import { getProduct, getProducts } from '../services/productos.service'
import type { Product } from '../types/product'

export type ProductState = {
  items: Product[]
  selectedId: number | null
  loading: boolean
  error: string | null
}

export const initialProductState: ProductState = {
  items: [], selectedId: null, loading: false, error: null,
}

export const fetchProducts = createAsyncThunk<Product[], void, { rejectValue: string }>(
  'product/fetchAll', async (_, { rejectWithValue }) => {
    try { return await getProducts() } catch (error) { return rejectWithValue(errorMessage(error)) }
  },
)

export const fetchProduct = createAsyncThunk<Product, number, { rejectValue: string }>(
  'product/fetchOne', async (id, { rejectWithValue }) => {
    try { return await getProduct(id) } catch (error) { return rejectWithValue(errorMessage(error)) }
  },
)

const productSlice = createSlice({
  name: 'product',
  initialState: initialProductState,
  reducers: {
    selectProduct(state, action: PayloadAction<number>) {
      if (state.items.some((product) => product.id === action.payload)) state.selectedId = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
        if (!state.items.some((product) => product.id === state.selectedId)) state.selectedId = null
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'No se pudieron cargar los productos.'
      })
      .addCase(fetchProduct.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchProduct.fulfilled, (state, action) => {
        state.loading = false
        const index = state.items.findIndex((product) => product.id === action.payload.id)
        if (index === -1) state.items.push(action.payload)
        else state.items[index] = action.payload
      })
      .addCase(fetchProduct.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'No se pudo cargar el producto.'
      })
  },
})

export const { selectProduct } = productSlice.actions
export default productSlice.reducer
