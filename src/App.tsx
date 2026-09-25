import { Link } from 'react-router-dom'
import { AppRoutes } from './routes/AppRoutes'

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-content">
          <Link className="brand" to="/productos">Checkout</Link>
          <span className="header-label">Compra de productos</span>
        </div>
      </header>
      <main className="container main-content">
        <AppRoutes />
      </main>
    </div>
  )
}

export default App
