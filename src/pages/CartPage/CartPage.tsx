import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { clearCard } from '../../services/card'
import { decreaseQuantity, increaseQuantity, removeProduct } from '../../store/cartSlice'
import { cartSubtotal, cartTotal } from '../../store/cartTotals'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchProducts } from '../../store/productSlice'
import { formatCurrency } from '../../utils/formatCurrency'

export function CartPage() {
  const dispatch = useAppDispatch()
  const { items } = useAppSelector((state) => state.cart)
  const { loading, error } = useAppSelector((state) => state.product)
  const transaction = useAppSelector((state) => state.transaction)
  useEffect(() => { clearCard(); void dispatch(fetchProducts()) }, [dispatch])
  const locked = !!transaction.id
  return <>
    <CheckoutSteps current="producto" />
    <section className="page-section">
      <h1>Carrito</h1>
      {loading && <p role="status">Actualizando stock del catálogo…</p>}
      {error && <div role="alert"><p>{error}</p><button className="button" onClick={() => void dispatch(fetchProducts())}>Reintentar</button></div>}
      {locked && <p className="notice">Hay una orden en proceso. Consulta su estado antes de modificar el carrito.</p>}
      {items.length === 0 ? <div className="panel empty-state"><p>Tu carrito está vacío.</p><Link className="button" to="/productos">Ver productos</Link></div> : <>
        <div className="cart-list">{items.map((item) => <article className="panel cart-item" key={item.productId}>
          <div className="product-visual" aria-hidden="true">{item.image ? <img src={item.image} alt="" /> : item.name.charAt(0)}</div>
          <div><h2>{item.name}</h2><p>Precio unitario: {formatCurrency(item.price)}</p><p>Stock disponible: {item.stock}</p>
            <p>Subtotal: {formatCurrency(cartSubtotal(item))}</p>
            <div className="cart-controls">
              <button type="button" aria-label={`Disminuir ${item.name}`} disabled={locked || item.quantity <= 1} onClick={() => dispatch(decreaseQuantity(item.productId))}>−</button>
              <span>Cantidad: {item.quantity}</span>
              <button type="button" aria-label={`Aumentar ${item.name}`} disabled={locked || item.quantity >= item.stock} onClick={() => dispatch(increaseQuantity(item.productId))}>+</button>
              <button type="button" disabled={locked} onClick={() => dispatch(removeProduct(item.productId))}>Eliminar</button>
            </div>
          </div>
        </article>)}</div>
        <p className="panel cart-total">Total de productos: <strong>{formatCurrency(cartTotal(items))}</strong></p>
        <p className="caption">Tarifa base, envío y total definitivo se calculan en el backend al continuar.</p>
        <div className="page-actions"><Link className="text-link" to="/productos">← Seguir comprando</Link>
          {locked ? <Link className="button" to={`/resultado/${items[0].productId}`}>Consultar compra pendiente</Link>
            : <Link className="button" to={`/checkout/${items[0].productId}`} aria-disabled={loading || !!error || items.some((item) => item.stock < item.quantity)}
              onClick={(event) => { if (loading || error || items.some((item) => item.stock < item.quantity)) event.preventDefault() }}>Ir al checkout</Link>}
        </div>
      </>}
    </section>
  </>
}
