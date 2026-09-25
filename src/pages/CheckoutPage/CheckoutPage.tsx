import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { ProductUnavailable } from '../../components/ProductUnavailable'
import { errorMessage } from '../../services/api'
import { saveCard, validCard, type Card } from '../../services/card'
import { getPaymentTerms, type PaymentTerms } from '../../services/payments.service'
import { acceptPersonal, acceptPrivacy, registerCustomer, setAcceptanceDocuments, updateCustomer, updateDelivery } from '../../store/checkoutSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchProduct } from '../../store/productSlice'
import { useRouteProduct } from '../../store/useRouteProduct'

export function CheckoutPage() {
  const { id } = useParams()
  const { product, ready, loading, error } = useRouteProduct(id, 'checkout')
  const { customer, delivery, clientId, clientStatus, clientError, privacyAccepted, personalAccepted } = useAppSelector((state) => state.checkout)
  const transaction = useAppSelector((state) => state.transaction)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const submitting = useRef(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [brand, setBrand] = useState('')
  const [terms, setTerms] = useState<PaymentTerms | null>(null)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [termsRetry, setTermsRetry] = useState(0)

  useEffect(() => {
    let active = true
    void getPaymentTerms().then((documents) => {
      if (!active) return
      dispatch(setAcceptanceDocuments({ privacy: documents.privacy, personal: documents.personal }))
      setTerms(documents)
      setTermsError(null)
    }).catch((failure: unknown) => { if (active) setTermsError(errorMessage(failure)) })
    return () => { active = false }
  }, [dispatch, termsRetry])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!product || !ready || !terms || !privacyAccepted || !personalAccepted || submitting.current) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const card: Card = { number: String(form.get('number') ?? ''), holder: String(form.get('holder') ?? ''),
      month: String(form.get('month') ?? ''), year: String(form.get('year') ?? ''),
      cvc: String(form.get('cvc') ?? ''), installments: Number(form.get('installments')) }
    if (!validCard(card)) { setCardError('Revisa el número, vencimiento, CVC, titular y cuotas de la tarjeta.'); return }
    setCardError(null)
    submitting.current = true
    try {
      if (!clientId) await dispatch(registerCustomer()).unwrap()
      saveCard(card)
      formElement.reset()
      navigate(`/resumen/${product.id}`)
    } catch {
      submitting.current = false
    }
  }

  if (loading) return <p role="status">Cargando producto…</p>
  if (error) return <section role="alert"><p>{error}</p><button className="button" onClick={() => void dispatch(fetchProduct(Number(id)))}>Reintentar</button></section>
  if (!product) return <ProductUnavailable />
  if (!ready) return <p role="status">Preparando checkout…</p>
  if (transaction.record && transaction.record.status !== 'PENDIENTE') return <section className="panel"><p>La compra ya tiene un resultado.</p><Link to={`/resultado/${product.id}`}>Consultar transacción</Link></section>

  return (
    <>
      <CheckoutSteps current="checkout" />
      <section className="page-section">
        <span className="eyebrow">Paso 2 de 4</span>
        <h1>Tarjeta y entrega</h1>
        <p>La tarjeta solo permanece en memoria hasta tokenizarse directamente con Wompi Sandbox. Si recargas, vuelve a introducirla.</p>
        <form onSubmit={(event) => void submit(event)} autoComplete="off">
          <div className="form-grid">
            <section className="panel" aria-labelledby="card-heading">
              <h2 id="card-heading">Datos de la tarjeta</h2>
              <div className="field-grid">
                <label>Número de tarjeta<input name="number" type="text" required inputMode="numeric" autoComplete="off" maxLength={23} placeholder="Número de tarjeta" onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '')
                  const prefix = Number(digits.slice(0, 4))
                  setBrand(digits.startsWith('4') ? 'VISA' : /^5[1-5]/.test(digits) || prefix >= 2221 && prefix <= 2720 ? 'Mastercard' : '')
                }} /></label>
                {brand && <p aria-live="polite">Tarjeta {brand}</p>}
                <label>Nombre del titular<input name="holder" type="text" required autoComplete="off" maxLength={150} /></label>
                <label>Mes de vencimiento<input name="month" type="text" required inputMode="numeric" autoComplete="off" maxLength={2} placeholder="MM" /></label>
                <label>Año de vencimiento<input name="year" type="text" required inputMode="numeric" autoComplete="off" maxLength={2} placeholder="AA" /></label>
                <label>CVC<input name="cvc" type="password" required inputMode="numeric" autoComplete="off" maxLength={4} /></label>
                <label>Cuotas<select name="installments" defaultValue="1">{[1, 2, 3, 6, 12, 24, 36].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              </div>
            </section>
            <section className="panel" aria-labelledby="delivery-heading">
              <h2 id="delivery-heading">Contacto y entrega</h2>
              <div className="field-grid">
                <label>Nombre<input type="text" required disabled={!!transaction.id} autoComplete="name" maxLength={150} value={customer.name} onChange={(event) => dispatch(updateCustomer({ name: event.target.value }))} /></label>
                <label>Correo<input type="email" required disabled={!!transaction.id} autoComplete="email" maxLength={150} value={customer.email} onChange={(event) => dispatch(updateCustomer({ email: event.target.value }))} /></label>
                <label>Teléfono<input type="tel" required disabled={!!transaction.id} autoComplete="tel" maxLength={30} value={customer.phone} onChange={(event) => dispatch(updateCustomer({ phone: event.target.value }))} /></label>
                <label>Dirección<input type="text" required autoComplete="street-address" maxLength={250} value={delivery.address} onChange={(event) => dispatch(updateDelivery({ address: event.target.value }))} /></label>
                <label>Ciudad<input type="text" required autoComplete="address-level2" maxLength={100} value={delivery.city} onChange={(event) => dispatch(updateDelivery({ city: event.target.value }))} /></label>
                <label>Departamento<input type="text" required autoComplete="address-level1" maxLength={100} value={delivery.department} onChange={(event) => dispatch(updateDelivery({ department: event.target.value }))} /></label>
                <label>Código postal<input type="text" autoComplete="postal-code" maxLength={20} value={delivery.postalCode} onChange={(event) => dispatch(updateDelivery({ postalCode: event.target.value }))} /></label>
              </div>
            </section>
          </div>
          {terms ? <section className="panel page-section" aria-label="Aceptación de documentos">
            <label><input type="checkbox" checked={privacyAccepted} onChange={(event) => dispatch(acceptPrivacy(event.target.checked))} /> Acepto la <a href={terms.privacy} target="_blank" rel="noopener noreferrer">política de privacidad</a></label>
            <label><input type="checkbox" checked={personalAccepted} onChange={(event) => dispatch(acceptPersonal(event.target.checked))} /> Autorizo el <a href={terms.personal} target="_blank" rel="noopener noreferrer">tratamiento de datos personales</a></label>
          </section> : termsError ? <div role="alert" className="notice"><p>{termsError}</p><button type="button" className="button" onClick={() => setTermsRetry((value) => value + 1)}>Reintentar documentos</button></div>
            : <p role="status">Cargando documentos de aceptación…</p>}
          {cardError && <p role="alert" className="notice">{cardError}</p>}
          {clientError && <p role="alert" className="notice">{clientError}</p>}
          <div className="page-actions">
            <Link className="text-link" to={`/productos/${product.id}`}>← Volver al producto</Link>
            <button className="button" type="submit" disabled={clientStatus === 'loading' || !terms || !privacyAccepted || !personalAccepted}>
              {clientStatus === 'loading' ? 'Guardando cliente…' : 'Guardar y ver resumen'}
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
