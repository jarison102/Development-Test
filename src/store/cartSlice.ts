import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Product } from '../types/product'
import { fetchProduct, fetchProducts } from './productSlice'

export type CartItem = { productId: number; name: string; price: string; image: string | null; stock: number; quantity: number }
export type CartState = { items: CartItem[] }
export const initialCartState: CartState = { items: [] }

const cartSlice = createSlice({
  name: 'cart', initialState: initialCartState,
  reducers: {
    addProduct(state, action: PayloadAction<Product>) {
      const product = action.payload
      if (product.stock < 1) return
      const item = state.items.find((entry) => entry.productId === product.id)
      if (item) {
        item.stock = product.stock
        item.price = product.price
        item.name = product.name
        item.image = product.image
        if (item.quantity < item.stock) item.quantity++
      } else state.items.push({ productId: product.id, name: product.name, price: product.price,
        image: product.image, stock: product.stock, quantity: 1 })
    },
    removeProduct(state, action: PayloadAction<number>) { state.items = state.items.filter((item) => item.productId !== action.payload) },
    increaseQuantity(state, action: PayloadAction<number>) {
      const item = state.items.find((entry) => entry.productId === action.payload)
      if (item && item.quantity < item.stock) item.quantity++
    },
    decreaseQuantity(state, action: PayloadAction<number>) {
      const item = state.items.find((entry) => entry.productId === action.payload)
      if (item && item.quantity > 1) item.quantity--
    },
    clearCart() { return initialCartState },
  },
  extraReducers: (builder) => {
    const sync = (state: CartState, product: Product) => {
      const item = state.items.find((entry) => entry.productId === product.id)
      if (item) { item.name = product.name; item.price = product.price; item.image = product.image; item.stock = product.stock }
    }
    builder.addCase(fetchProducts.fulfilled, (state, action) => {
      state.items = state.items.filter((item) => action.payload.some((product) => product.id === item.productId))
      action.payload.forEach((product) => sync(state, product))
    }).addCase(fetchProduct.fulfilled, (state, action) => sync(state, action.payload))
  },
})

export const { addProduct, removeProduct, increaseQuantity, decreaseQuantity, clearCart } = cartSlice.actions
export default cartSlice.reducer
