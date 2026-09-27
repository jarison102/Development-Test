import { Link } from 'react-router-dom'
import { AppRoutes } from './routes/AppRoutes'
import { useAppSelector } from './store/hooks'

function App() {
  const unitCount = useAppSelector((state) => state.cart.items.reduce((total, item) => total + item.quantity, 0))

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-content">
          <Link className="brand" to="/productos">Checkout</Link>
          <Link className="cart-link" to="/carrito" aria-label={`Carrito: ${unitCount} ${unitCount === 1 ? 'unidad' : 'unidades'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h2l2.1 10.1a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21 7H6" />
              <circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" />
            </svg>
            <span>Carrito</span>
            <span className="cart-count" aria-hidden="true" key={unitCount}>{unitCount}</span>
          </Link>
        </div>
      </header>
      <main className="container main-content">
        <AppRoutes />
      </main>
    </div>
  )
}

export default App
