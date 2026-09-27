import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import type { Product } from '../../types/product'

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

export function ProductPage() {
  const { id } = useParams()
  const { product, ready, loading, error } = useRouteProduct(id, 'producto')
  const dispatch = useAppDispatch()
  const { items, selectedId, loading: catalogLoading, error: catalogError } = useAppSelector((state) => state.product)
  const { quantity, step } = useAppSelector((state) => state.checkout)
  const cart = useAppSelector((state) => state.cart.items)
  const transaction = useAppSelector((state) => state.transaction)
  const transactionId = transaction.id
  const [addedProduct, setAddedProduct] = useState<{ name: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [availability, setAvailability] = useState('todos')
  const [maxPrice, setMaxPrice] = useState('')
  const productGrid = useRef<HTMLDivElement>(null)
  const hasFilters = !!(searchQuery || maxPrice || availability !== 'todos')
  const filteredItems = useMemo(() => {
    const query = normalize(searchQuery.trim())
    return items.filter((item) => (!query || normalize(`${item.name} ${item.description}`).includes(query))
      && (availability === 'todos' || availability === 'disponibles' && item.stock > 0 || availability === 'agotados' && item.stock === 0)
      && (!maxPrice || Number(item.price) <= Number(maxPrice)))
  }, [items, searchQuery, availability, maxPrice])

  function clearFilters() {
    setSearchQuery('')
    setAvailability('todos')
    setMaxPrice('')
  }

  useLayoutEffect(() => {
    const grid = productGrid.current
    if (id || catalogLoading || !filteredItems.length || !grid || !('IntersectionObserver' in window)
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting))
    }, { threshold: 0.1 })
    grid.classList.add('reveal-active')
    grid.querySelectorAll('.product-arrival').forEach((card) => observer.observe(card))
    return () => { observer.disconnect(); grid.classList.remove('reveal-active') }
  }, [id, catalogLoading, filteredItems])

  function handleAdd(product: Product) {
    dispatch(addProduct(product))
    setAddedProduct({ name: product.name })
  }

  useEffect(() => {
    if (!addedProduct) return
    const timer = window.setTimeout(() => setAddedProduct(null), 3000)
    return () => window.clearTimeout(timer)
  }, [addedProduct])

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
      {addedProduct && <div className="cart-toast" role="status"><span className="cart-toast-icon" aria-hidden="true">✓</span><span>{addedProduct.name} se añadió al carrito</span></div>}
      <CheckoutSteps current="producto" />
      {product ? (
        <section className="page-section">
          <Link className="button button-secondary" to="/productos">← Todos los productos</Link>
          <div className="panel product-detail">
            <div className="product-visual product-visual-large" aria-hidden="true">
              {product.image ? <img src={product.image} alt="" /> : product.name.charAt(0)}
            </div>
            <div className="product-detail-content">
              <h1>{product.name}</h1>
              <p>{product.description}</p>
              <strong className="price">{formatCurrency(product.price)}</strong>
              <p className="stock">Unidades disponibles: {product.stock > 0 ? product.stock : 'Agotado'}</p>
              <button className="button button-secondary" type="button" disabled={!ready || !!transactionId || product.stock < 1 || (cart.find((item) => item.productId === product.id)?.quantity ?? 0) >= product.stock}
                onClick={() => handleAdd(product)}>Agregar al carrito</button>
              <Link className="button button-secondary" to="/carrito">Ver carrito</Link>
              {cart.length ? <p>Modifica las cantidades desde el carrito.</p> : <>
                <label className="quantity-field" htmlFor="quantity">Cantidad</label>
                <input id="quantity" type="number" min="1" max={product.stock} value={quantity} disabled={!ready || !!transactionId}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isSafeInteger(value) && value >= 1 && value <= product.stock) dispatch(setQuantity(value))
                  }} />
              </>}
              {transactionId && selectedId === product.id ? (
                <><Link className="button" to={`/resultado/${product.id}`}>Consultar estado de compra</Link>
                  {transaction.record?.status === 'PENDIENTE' && <Link className="text-link" to={`/checkout/${product.id}`}>Continuar compra pendiente</Link>}</>
              ) : ready && (cart.length ? cart.every((item) => item.stock >= item.quantity) : product.stock > 0 && quantity <= product.stock) ? (
                <Link className="button" to={`/checkout/${cart[0]?.productId ?? product.id}`}>{cart.length ? 'Continuar compra del carrito' : 'Comprar con tarjeta'}</Link>
              ) : <p>Sin unidades suficientes para la cantidad elegida.</p>}
            </div>
          </div>
        </section>
      ) : (
        <section className="page-section">
          <div className="catalog-hero">
            <span className="eyebrow">Encuentra algo para ti</span>
            <h1>Elige tu producto</h1>
            <p>Explora el catálogo y compara precios, descripciones y unidades disponibles.</p>
          </div>
          {!catalogLoading && !catalogError && selectedId && cart.some((item) => item.productId === selectedId) && step !== 'producto' && (
            <p className="notice"><Link to={`/${step}/${selectedId}`}>Continuar compra anterior</Link></p>
          )}
          {!catalogLoading && !catalogError && items.length > 0 && <>
            <section className="panel catalog-toolbar" aria-label="Buscar y filtrar productos">
              <label className="catalog-field catalog-search">Buscar productos
                <input type="search" placeholder="Nombre o descripción" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              </label>
              <label className="catalog-field">Disponibilidad
                <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
                  <option value="todos">Todos</option><option value="disponibles">Disponibles</option><option value="agotados">Agotados</option>
                </select>
              </label>
              <label className="catalog-field">Precio máximo (COP)
                <input type="number" min="0" step="1000" placeholder="Sin límite" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
              </label>
            </section>
            <div className="catalog-results"><p role="status">{filteredItems.length} de {items.length} productos</p>
              {hasFilters && <button className="button button-secondary" type="button" onClick={clearFilters}>Limpiar filtros</button>}
            </div>
          </>}
          {catalogLoading ? <><p role="status">Cargando productos…</p><div className="product-grid" aria-hidden="true">{[0, 1, 2].map((index) => <div className="panel product-card product-skeleton" key={index}><div className="skeleton-visual" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line-short" /></div>)}</div></> : catalogError ? (
            <div role="alert"><p>{catalogError}</p><button className="button" onClick={() => void dispatch(fetchProducts())}>Reintentar</button></div>
          ) : items.length === 0 ? <p>No hay productos disponibles.</p> : filteredItems.length === 0 ? (
            <div className="panel catalog-empty"><h2>No encontramos productos con esos filtros.</h2><p>Prueba con otro nombre, disponibilidad o precio.</p><button className="button" type="button" onClick={clearFilters}>Ver todos los productos</button></div>
          ) : (
            <div className="product-grid" ref={productGrid}>{filteredItems.map((item, index) => <div className="product-arrival" key={item.id} style={{ transitionDelay: `${index % 3 * 75}ms` }}><ProductCard product={item} onAdd={handleAdd} addDisabled={!!transactionId || (cart.find((entry) => entry.productId === item.id)?.quantity ?? 0) >= item.stock} /></div>)}</div>
          )}
        </section>
      )}
    </>
  )
}
