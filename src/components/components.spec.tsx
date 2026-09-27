import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CheckoutSteps } from './CheckoutSteps'
import { OrderSummary } from './OrderSummary'
import { ProductCard } from './ProductCard'
import { ProductUnavailable } from './ProductUnavailable'

const product = { id: 1, name: 'Audífonos', description: 'Desc', price: '250000.00', stock: 9, image: null }

function inRouter(element: React.ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>)
}

describe('ProductCard', () => {
  it('muestra la inicial del producto cuando no hay imagen', () => {
    inRouter(<ProductCard product={product} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver producto' })).toHaveAttribute('href', '/productos/1')
  })

  it('desactiva el botón si el producto está agotado', () => {
    const add = jest.fn()
    inRouter(<ProductCard product={{ ...product, stock: 0 }} onAdd={add} />)
    expect(screen.getByText('Agotado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled()
  })

  it('renderiza la imagen cuando existe', () => {
    const { container } = inRouter(<ProductCard product={{ ...product, image: 'https://img.test/x.png' }} />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.test/x.png')
  })
})

describe('OrderSummary', () => {
  const base = { productId: 1, subtotal: '250000.00', baseFee: '1500.00',
    shippingFee: '5000.00', total: '256500.00' }

  it('usa singular para una unidad', () => {
    inRouter(<OrderSummary product={product} summary={{ ...base, quantity: 1 }} />)
    expect(screen.getByText(/Audífonos · 1 unidad ·/)).toBeInTheDocument()
    expect(screen.getByText('Tarifa de servicio')).toBeInTheDocument()
    expect(screen.getByText('Este es el desglose de los importes de tu compra.')).toBeInTheDocument()
  })

  it('pinta artículos y precios unitarios históricos proporcionados por backend', () => {
    inRouter(<OrderSummary product={product} names={[product]} summary={{ ...base, quantity: 3,
      items: [{ productId: 1, quantity: 2, unitPrice: '100.00', subtotal: '200.00' },
        { productId: 2, quantity: 1, unitPrice: '50.00', subtotal: '50.00' }] }} />)
    expect(screen.getByText(/Audífonos · 2 unidades ·/)).toBeInTheDocument()
    expect(screen.getByText(/Producto 2 · 1 unidad ·/)).toBeInTheDocument()
  })

  it('usa plural para varias unidades', () => {
    inRouter(<OrderSummary product={product} summary={{ ...base, quantity: 3 }} />)
    expect(screen.getByText(/Audífonos · 3 unidades ·/)).toBeInTheDocument()
  })
})

describe('ProductUnavailable', () => {
  it('ofrece volver al catálogo', () => {
    inRouter(<ProductUnavailable />)
    expect(screen.getByRole('heading', { name: 'Producto no disponible' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/productos')
  })
})

describe('CheckoutSteps', () => {
  it('marca el paso actual', () => {
    inRouter(<CheckoutSteps current="resumen" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[2]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
  })
})
