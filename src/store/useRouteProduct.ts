import { useEffect, useState } from 'react'
import { resetCheckout, setStep } from './checkoutSlice'
import { useAppDispatch, useAppSelector } from './hooks'
import { fetchProduct, selectProduct } from './productSlice'
import { clearTransaction } from './transactionSlice'
import type { CheckoutStep } from '../types/checkout'

export function useRouteProduct(id: string | undefined, step: CheckoutStep) {
  const dispatch = useAppDispatch()
  const { items, selectedId, loading, error } = useAppSelector((state) => state.product)
  const productId = Number(id)
  const validId = !!id && Number.isSafeInteger(productId) && productId > 0
  const product = items.find((item) => item.id === productId)
  const [validatedId, setValidatedId] = useState<number | null>(null)

  useEffect(() => {
    if (!validId) return
    let active = true
    void dispatch(fetchProduct(productId)).then((action) => {
      if (active && fetchProduct.fulfilled.match(action)) setValidatedId(productId)
    })
    return () => { active = false }
  }, [dispatch, productId, validId])

  useEffect(() => {
    if (!product || validatedId !== productId || loading || error) return
    if (selectedId !== product.id) {
      dispatch(resetCheckout())
      dispatch(clearTransaction())
      dispatch(selectProduct(product.id))
    }
    dispatch(setStep(step))
  }, [dispatch, error, loading, product, productId, selectedId, step, validatedId])

  return {
    product: error ? undefined : product,
    ready: !!product && validatedId === productId && !loading && !error && selectedId === product.id,
    loading: validId && (loading || (validatedId !== productId && !error)),
    error,
  }
}
