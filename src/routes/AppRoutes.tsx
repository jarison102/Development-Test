import { Navigate, Route, Routes } from 'react-router-dom'
import { CartPage } from '../pages/CartPage/CartPage'
import { CheckoutPage } from '../pages/CheckoutPage/CheckoutPage'
import { ProductPage } from '../pages/ProductPage/ProductPage'
import { ResultPage } from '../pages/ResultPage/ResultPage'
import { SummaryPage } from '../pages/SummaryPage/SummaryPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/productos" replace />} />
      <Route path="/productos" element={<ProductPage />} />
      <Route path="/productos/:id" element={<ProductPage />} />
      <Route path="/carrito" element={<CartPage />} />
      <Route path="/checkout/:id" element={<CheckoutPage />} />
      <Route path="/resumen/:id" element={<SummaryPage />} />
      <Route path="/resultado/:id" element={<ResultPage />} />
      <Route path="*" element={<Navigate to="/productos" replace />} />
    </Routes>
  )
}
