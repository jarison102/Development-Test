import { Link } from 'react-router-dom'

export function ProductUnavailable() {
  return (
    <section className="panel empty-state">
      <h1>Producto no disponible</h1>
      <p>No encontramos ese producto en el catálogo de demostración.</p>
      <Link className="button" to="/productos">Ver productos</Link>
    </section>
  )
}
