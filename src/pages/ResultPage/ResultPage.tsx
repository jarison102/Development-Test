import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { OrderSummary } from '../../components/OrderSummary'
import { ProductUnavailable } from '../../components/ProductUnavailable'
import { clearCard } from '../../services/card'
import { clearCart } from '../../store/cartSlice'
import { resetCheckout } from '../../store/checkoutSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchProduct } from '../../store/productSlice'
import { clearTransaction, refreshTransaction, verifyPayment } from '../../store/transactionSlice'
import { useRouteProduct } from '../../store/useRouteProduct'
import { formatCurrency } from '../../utils/formatCurrency'

const headings = {
  PENDIENTE: 'Transacción creada - pendiente de pago',
  APROBADA: 'Pago aprobado',
  RECHAZADA: 'Pago rechazado',
}

export function ResultPage() {
  const { id } = useParams()
  const { product, ready, loading, error } = useRouteProduct(id, 'resultado')
  const transaction = useAppSelector((state) => state.transaction)
  const cart = useAppSelector((state) => state.cart.items)
  const key = useAppSelector((state) => state.checkout.idempotencyKey)
  const dispatch = useAppDispatch()
  const [verifiedId, setVerifiedId] = useState<number | null>(null)

  useEffect(() => {
    if (!ready || !transaction.id) return
    let active = true
    const transactionId = transaction.id
    const request = () => dispatch(key ? verifyPayment(transactionId) : refreshTransaction(transactionId))
      .then((action) => {
        if (active && (verifyPayment.fulfilled.match(action) || refreshTransaction.fulfilled.match(action))) setVerifiedId(transactionId)
      })
    void request()
    const timer = key && transaction.record?.status === 'PENDIENTE' ? setInterval(() => { void request() }, 3000) : null
    return () => { active = false; if (timer) clearInterval(timer) }
  }, [dispatch, ready, transaction.id, transaction.record?.status, key])

  if (loading) return <p role="status">Cargando producto…</p>
  if (error) return <section role="alert"><p>{error}</p><button className="button" onClick={() => void dispatch(fetchProduct(Number(id)))}>Reintentar</button></section>
  if (!product) return <ProductUnavailable />
  if (!ready) return <p role="status">Preparando resultado…</p>

  const record = transaction.record?.productId === product.id ? transaction.record : null
  return (
    <>
      <CheckoutSteps current="resultado" />
      <section className="page-section narrow-section">
        <span className="eyebrow">Paso 4 de 4</span>
        <div className="panel result-panel">
          {transaction.id && (transaction.loading || (verifiedId !== transaction.id && !transaction.error)) ? <p role="status">Verificando transacción en el backend…</p> : record && verifiedId === record.id ? (
            <>
              <h1>{headings[record.status]}</h1>
              <p>Referencia: {record.reference}</p>
              <p>Total calculado por el backend: {formatCurrency(record.total)}</p>
              {record.items && <OrderSummary product={product} summary={record} names={cart.map((item) => ({
                id: item.productId, name: item.name, description: '', price: item.price, stock: item.stock, image: item.image,
              }))} />}
              {record.status === 'PENDIENTE' && <p>El pago puede seguir en proceso. Consultaremos su estado; no se descontará stock ni se creará entrega hasta que se apruebe.</p>}
            </>
          ) : <h1>Sin resultado de pago</h1>}
          {transaction.error && (
            <div role="alert"><p>{transaction.error}</p><button className="button" onClick={() => {
              if (!transaction.id) return
              setVerifiedId(null)
              void dispatch(key ? verifyPayment(transaction.id) : refreshTransaction(transaction.id)).then((action) => {
                if (verifyPayment.fulfilled.match(action) || refreshTransaction.fulfilled.match(action)) setVerifiedId(action.payload.id)
              })
            }}>Reintentar consulta</button></div>
          )}
          {!transaction.id && <p>Todavía no hay una transacción para esta compra.</p>}
          <Link className="button" to={`/productos/${product.id}`} onClick={() => {
            clearCard()
            if (record && record.status !== 'PENDIENTE' && verifiedId === record.id) {
              if (record.status === 'APROBADA') dispatch(clearCart())
              dispatch(clearTransaction())
              dispatch(resetCheckout())
            }
          }}>Volver al producto</Link>
        </div>
      </section>
    </>
  )
}
