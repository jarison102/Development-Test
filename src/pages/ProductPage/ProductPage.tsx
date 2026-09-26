import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckoutSteps } from '../../components/CheckoutSteps'
import { ProductCard } from '../../components/ProductCard'
import { ProductUnavailable } from '../../components/ProductUnavailable'
import { clearCard } from '../../services/card'
import { addProduct } from '../../store/cartSlice'
import { resetCheckout, setQuantity } from '../../store/checkoutSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchProduct, fetchProducts } from '../../store/productSlice'
import { clearTransaction, refreshTransaction } from '../../store/transactionSlice'
import { useRouteProduct } from '../../store/useRouteProduct'
import { formatCurrency } from '../../utils/formatCurrency'

export function ProductPage() {
  const { id } = useParams()
  const { product, ready, loading, error } = useRouteProduct(id, 'producto')
  const dispatch = useAppDispatch()
  const { items, selectedId, loading: catalogLoading, error: catalogError } = useAppSelector((state) => state.product)
  const { quantity, step } = useAppSelector((state) => state.checkout)
  const cart = useAppSelector((state) => state.cart.items)
  const transaction = useAppSelector((state) => state.transaction)
  const transactionId = transaction.id

  useEffect(() => {
    clearCard()
  }, [])

  useEffect(() => {
    if (!id) void dispatch(fetchProducts())
  }, [dispatch, id])

  useEffect(() => {
    if (!id || !ready || !transactionId || selectedId !== product?.id) return
    if (!transaction.record) {
      if (!transaction.loading && !transaction.error) void dispatch(refreshTransaction(transactionId))
      return
    }
    if (transaction.record.id === transactionId && transaction.record.status !== 'PENDIENTE') {
      clearCard()
      dispatch(clearTransaction())
      dispatch(resetCheckout())
    }
  }, [dispatch, id, ready, product?.id, selectedId, transactionId,
    transaction.record, transaction.loading, transaction.error])

  if (id && loading) return <p role="status">Cargando producto…</p>
  if (id && error) return <section className="panel empty-state"><p role="alert">{error}</p><button className="button" onClick={() => void dispatch(fetchProduct(Number(id)))}>Reintentar</button></section>
  if (id && !product) return <ProductUnavailable />

  return (
    <>
      <CheckoutSteps current="producto" />
      {product ? (
        <section className="page-section">
          <Link className="text-link" to="/productos">← Todos los productos</Link>
          <div className="panel product-detail">
            <div className="product-visual product-visual-large" aria-hidden="true">
              {product.image ? <img src={product.image} alt="" /> : product.name.charAt(0)}
            </div>
            <div className="product-detail-content">
              <h1>{product.name}</h1>
              <p>{product.description}</p>
              <strong className="price">{formatCurrency(product.price)}</strong>
              <p className="stock">Stock disponible: {product.stock > 0 ? product.stock : 'Agotado'}</p>
              <button className="button button-secondary" type="button" disabled={!ready || !!transactionId || product.stock < 1 || (cart.find((item) => item.productId === product.id)?.quantity ?? 0) >= product.stock}
                onClick={() => dispatch(addProduct(product))}>Agregar al carrito</button>
              <Link className="text-link" to="/carrito">Ver carrito</Link>
              {cart.length ? <p>Modifica las cantidades desde el carrito.</p> : <>
                <label className="quantity-field" htmlFor="quantity">Cantidad</label>
                <input id="quantity" type="number" min="1" max={product.stock} value={quantity} disabled={!ready || !!transactionId}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isSafeInteger(value) && value >= 1 && value <= product.stock) dispatch(setQuantity(value))
                  }} />
              </>}
              {transactionId && selectedId === product.id ? (
                <><Link className="button" to={`/resultado/${product.id}`}>Consultar transacción</Link>
                  {transaction.record?.status === 'PENDIENTE' && <Link className="text-link" to={`/checkout/${product.id}`}>Continuar compra pendiente</Link>}</>
              ) : ready && (cart.length ? cart.every((item) => item.stock >= item.quantity) : product.stock > 0 && quantity <= product.stock) ? (
                <Link className="button" to={`/checkout/${cart[0]?.productId ?? product.id}`}>{cart.length ? 'Continuar compra del carrito' : 'Comprar con tarjeta'}</Link>
              ) : <p>Sin unidades suficientes para la cantidad elegida.</p>}
            </div>
          </div>
        </section>
      ) : (
        <section className="page-section">
          <h1>Elige tu producto</h1>
          <p>Consulta la descripción, el precio y las unidades disponibles antes de comprar.</p>
          {selectedId && step !== 'producto' && (
            <p className="notice"><Link to={`/${step}/${selectedId}`}>Continuar compra anterior</Link></p>
          )}
          {catalogLoading ? <p role="status">Cargando productos…</p> : catalogError ? (
            <div role="alert"><p>{catalogError}</p><button className="button" onClick={() => void dispatch(fetchProducts())}>Reintentar</button></div>
          ) : items.length === 0 ? <p>No hay productos disponibles.</p> : (
            <div className="product-grid">{items.map((item) => <ProductCard key={item.id} product={item} onAdd={(value) => dispatch(addProduct(value))} addDisabled={!!transactionId || (cart.find((entry) => entry.productId === item.id)?.quantity ?? 0) >= item.stock} />)}</div>
          )}
        </section>
      )}
    </>
  )
}
