import { Link } from 'react-router-dom'
import type { Product } from '../types/product'
import { formatCurrency } from '../utils/formatCurrency'

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="panel product-card">
      <div className="product-visual" aria-hidden="true">
        {product.image ? <img src={product.image} alt="" loading="lazy" /> : product.name.charAt(0)}
      </div>
      <div className="product-info">
        <h2>{product.name}</h2>
        <p>{product.description}</p>
        <div className="product-meta">
          <strong>{formatCurrency(product.price)}</strong>
          <span>{product.stock} disponibles</span>
        </div>
        <Link className="button button-secondary" to={`/productos/${product.id}`}>Ver producto</Link>
      </div>
    </article>
  )
}
