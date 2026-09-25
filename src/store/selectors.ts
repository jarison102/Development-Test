import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './store'

export const selectCurrentProduct = createSelector(
  [(state: RootState) => state.product.items, (state: RootState) => state.product.selectedId],
  (items, selectedId) => items.find((product) => product.id === selectedId) ?? null,
)

export const selectPurchaseSummary = (state: RootState) => state.checkout.quote
