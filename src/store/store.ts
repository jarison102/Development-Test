import { combineReducers, configureStore } from '@reduxjs/toolkit'
import cartReducer from './cartSlice'
import checkoutReducer from './checkoutSlice'
import { loadPersistedState, saveProgress } from './persistence'
import productReducer from './productSlice'
import transactionReducer from './transactionSlice'

const rootReducer = combineReducers({
  product: productReducer,
  cart: cartReducer,
  checkout: checkoutReducer,
  transaction: transactionReducer,
})

export type RootState = ReturnType<typeof rootReducer>

export function createAppStore() {
  const appStore = configureStore({
    reducer: rootReducer,
    preloadedState: loadPersistedState(),
  })
  appStore.subscribe(() => saveProgress(appStore.getState()))
  return appStore
}

export const store = createAppStore()
export type AppDispatch = typeof store.dispatch
