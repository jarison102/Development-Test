import { useEffect, useRef, useState } from 'react'
import { useStore } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { OrderSummary } from '../../components/OrderSummary'
import { ProductUnavailable } from '../../components/ProductUnavailable'
import { errorMessage } from '../../services/api'
import { clearCard, getCard } from '../../services/card'
import { getPaymentTerms, payTransaction, tokenizeCard, type PaymentTerms } from '../../services/payments.service'
import { acceptPersonal, acceptPrivacy, fetchCartQuote, fetchQuote, setAcceptanceDocuments } from '../../store/checkoutSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchProduct } from '../../store/productSlice'
import { selectPurchaseSummary } from '../../store/selectors'
import type { RootState } from '../../store/store'
import { refreshTransaction, submitTransaction, verifyPayment } from '../../store/transactionSlice'
import { useRouteProduct } from '../../store/useRouteProduct'

export function SummaryPage() {
  const { id } = useParams()
  const { product, ready, loading, error } = useRouteProduct(id, 'resumen')
  const { customer, delivery, quantity, clientId, idempotencyKey, quoteStatus, quoteError,
    privacyAccepted, personalAccepted } = useAppSelector((state) => state.checkout)
  const quote = useAppSelector(selectPurchaseSummary)
  const cartItems = useAppSelector((state) => state.cart.items)
  const catalog = useAppSelector((state) => state.product.items)
  const transaction = useAppSelector((state) => state.transaction)
  const dispatch = useAppDispatch()
  const appStore = useStore<RootState>()
  const navigate = useNavigate()
  const submitting = useRef(false)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [terms, setTerms] = useState<PaymentTerms | null>(null)
  const [termsRetry, setTermsRetry] = useState(0)

  useEffect(() => {
    if (ready && product && !transaction.id) {
      if (cartItems.length) void dispatch(fetchCartQuote())
      else void dispatch(fetchQuote({ productId: product.id, quantity }))
    }
  }, [dispatch, product, quantity, ready, transaction.id, cartItems])

  useEffect(() => {
    if (ready && transaction.id && !transaction.record) void dispatch(refreshTransaction(transaction.id))
  }, [dispatch, ready, transaction.id, transaction.record])

  useEffect(() => {
    let active = true
    void getPaymentTerms().then((value) => {
      if (!active) return
      dispatch(setAcceptanceDocuments({ privacy: value.privacy, personal: value.personal }))
      setTerms(value)
      setPayError(null)
    }).catch((failure: unknown) => { if (active) setPayError(errorMessage(failure)) })
    return () => { active = false }
  }, [dispatch, termsRetry])

  async function confirm() {
    if (!product || !clientId || !terms || !privacyAccepted || !personalAccepted || submitting.current || transaction.creating
      || transaction.record?.status !== undefined && transaction.record.status !== 'PENDIENTE') return
    if (transaction.id && transaction.record?.externalId) {
      void dispatch(verifyPayment(transaction.id)).then(() => navigate(`/resultado/${product.id}`))
      return
    }
    const card = getCard()
    if (!card) { setPayError('Vuelve al checkout e introduce la tarjeta; no se conserva al recargar.'); return }
    if (!delivery.address.trim() || !delivery.city.trim() || !delivery.department.trim()) {
      setPayError('Completa la información de entrega.'); return
    }
    submitting.current = true
    setPaying(true)
    setPayError(null)
    try {
      const record = transaction.id ? transaction.record ?? await dispatch(refreshTransaction(transaction.id)).unwrap()
        : await dispatch(submitTransaction()).unwrap()
      const key = idempotencyKey ?? appStore.getState().checkout.idempotencyKey
      if (!key) throw new Error('Falta la clave de la orden')
      if (!transaction.id && quote && (record.total !== quote.total || JSON.stringify(record.items) !== JSON.stringify(quote.items))) {
        setPayError('El importe cambió al crear la orden. Revisa el nuevo resumen y vuelve a confirmar antes de pagar.')
        submitting.current = false
        return
      }
      const token = await tokenizeCard(card, terms)
      clearCard()
      await payTransaction(record.id, key, token, card.installments, delivery, terms)
      await dispatch(refreshTransaction(record.id)).unwrap()
      navigate(`/resultado/${product.id}`)
    } catch (failure) {
      setPayError(errorMessage(failure))
      submitting.current = false
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <p role="status">Cargando producto…</p>
  if (error) return <section role="alert"><p>{error}</p><button className="button" onClick={() => void dispatch(fetchProduct(Number(id)))}>Reintentar</button></section>
  if (!product) return <ProductUnavailable />
  if (!ready) return <p role="status">Preparando resumen…</p>

  const summary = transaction.record && transaction.record.productId === product.id
    ? { productId: product.id, quantity: transaction.record.quantity, items: transaction.record.items,
        subtotal: transaction.record.subtotal,
        baseFee: transaction.record.baseFee, shippingFee: transaction.record.shippingFee, total: transaction.record.total }
    : quote

  return (
    <>
      <CheckoutSteps current="resumen" />
      <section className="page-section narrow-section">
        <span className="eyebrow">Paso 3 de 4</span>
        <h1>Resumen de compra</h1>
        <p>El backend recalcula importes y comprueba el stock al crear la orden; reserva disponibilidad justo antes del pago.</p>
        {transaction.id && !transaction.record && <p role="status">Consultando transacción existente…</p>}
        {!transaction.id && quoteStatus === 'loading' && <p role="status">Calculando importes…</p>}
        {!transaction.id && quoteError && <div role="alert"><p>{quoteError}</p><button className="button" onClick={() => { if (cartItems.length) void dispatch(fetchCartQuote()); else void dispatch(fetchQuote({ productId: product.id, quantity })) }}>Reintentar cotización</button></div>}
        {summary && <OrderSummary product={product} summary={summary} names={[...catalog, ...cartItems.map((item) => ({
          id: item.productId, name: item.name, description: '', price: item.price, stock: item.stock, image: item.image,
        }))]} />}
        {customer.name && delivery.address && <section className="panel delivery-summary">
          <h2>Datos de entrega</h2>
          <p>{customer.name} · {customer.email} · {customer.phone}</p>
          <p>{delivery.address}, {delivery.city}, {delivery.department} {delivery.postalCode}</p>
        </section>}
        {terms && <section className="panel">
          <label><input type="checkbox" checked={privacyAccepted} onChange={(event) => dispatch(acceptPrivacy(event.target.checked))} /> Acepto la <a href={terms.privacy} target="_blank" rel="noopener noreferrer">política de privacidad</a></label>
          <label><input type="checkbox" checked={personalAccepted} onChange={(event) => dispatch(acceptPersonal(event.target.checked))} /> Autorizo el <a href={terms.personal} target="_blank" rel="noopener noreferrer">tratamiento de datos personales</a></label>
        </section>}
        {transaction.error && <p role="alert" className="notice">{transaction.error}</p>}
        {payError && <p role="alert" className="notice">{payError}</p>}
        {!terms && payError && <button className="button button-secondary" type="button" onClick={() => {
          setPayError(null)
          setTermsRetry((value) => value + 1)
        }}>Reintentar documentos</button>}
        {transaction.id && <p className="notice">La orden ya existe; el pago no creará una segunda transacción interna. <Link to={`/resultado/${product.id}`}>Consultar estado</Link></p>}
        <div className="page-actions">
          <Link className="text-link" to={`/checkout/${product.id}`}>← Volver a los datos</Link>
          {transaction.record?.status !== 'APROBADA' && transaction.record?.status !== 'RECHAZADA' ? (
            <button className="button" type="button" onClick={() => void confirm()}
              disabled={!clientId || !terms || !privacyAccepted || !personalAccepted || !summary || (!transaction.id && quoteStatus !== 'succeeded') || paying || transaction.creating}>
              {paying || transaction.creating ? 'Procesando pago…' : 'Pagar en Sandbox'}
            </button>
          ) : <Link className="button" to={`/resultado/${product.id}`}>Consultar resultado</Link>}
        </div>
      </section>
    </>
  )
}
