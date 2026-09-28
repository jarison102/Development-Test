import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { createAppStore } from '../store/store'
import { acceptPersonal, acceptPrivacy, setAcceptanceDocuments } from '../store/checkoutSlice'
import { getProduct, getProducts } from '../services/productos.service'
import { createCustomer } from '../services/clientes.service'
import { createCartTransaction, createTransaction, getTransaction, quoteCart, quoteTransaction } from '../services/transacciones.service'
import { checkPayment, getPaymentTerms, payTransaction, tokenizeCard } from '../services/payments.service'
import { getCard, saveCard } from '../services/card'

jest.mock('../services/config', () => ({ apiUrl: 'http://localhost:3000/api' }))
jest.mock('../services/productos.service')
jest.mock('../services/clientes.service')
jest.mock('../services/transacciones.service')
jest.mock('../services/payments.service')

const products = [
  { id: 1, name: 'Audífonos Pro', description: 'Producto real', price: '250000.00', stock: 10, image: null },
  { id: 2, name: 'Teclado', description: 'Segundo producto', price: '320000.00', stock: 8, image: null },
  { id: 3, name: 'Mouse', description: 'Tercer producto', price: '150000.00', stock: 15, image: null },
]
const record = {
  id: 18, reference: 'ref-test', productId: 1, customerId: 7, quantity: 2,
  subtotal: '500000.00', baseFee: '1500.00', shippingFee: '5000.00', total: '506500.00',
  status: 'PENDIENTE' as const, externalId: null,
}

function open(path: string) {
  return render(<Provider store={createAppStore()}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></Provider>)
}

beforeEach(() => {
  localStorage.clear()
  jest.mocked(getProducts).mockReset().mockResolvedValue(products)
  jest.mocked(getProduct).mockReset().mockImplementation(async (id) => products.find((item) => item.id === id) ?? products[0])
  jest.mocked(createCustomer).mockReset().mockResolvedValue(7)
  jest.mocked(quoteTransaction).mockReset().mockResolvedValue({
    productId: 1, quantity: 2, subtotal: '500000.00', baseFee: '1500.00',
    shippingFee: '5000.00', total: '506500.00',
  })
  jest.mocked(createTransaction).mockReset().mockResolvedValue(record)
  jest.mocked(createCartTransaction).mockReset().mockResolvedValue(record)
  jest.mocked(quoteCart).mockReset().mockResolvedValue({ productId: 1, quantity: 2,
    items: [{ productId: 1, quantity: 2, unitPrice: '250000.00', subtotal: '500000.00' },
      { productId: 2, quantity: 1, unitPrice: '320000.00', subtotal: '320000.00' }],
    subtotal: '820000.00', baseFee: '1500.00', shippingFee: '5000.00', total: '826500.00' })
  jest.mocked(getTransaction).mockReset().mockResolvedValue(record)
  jest.mocked(getPaymentTerms).mockReset().mockResolvedValue({ privacy: 'https://example.test/privacy',
    personal: 'https://example.test/personal', publicKey: 'public-test-placeholder', sandboxUrl: 'https://sandbox.wompi.co/v1',
    tokenizationKey: 'pem-placeholder' })
  jest.mocked(tokenizeCard).mockReset().mockResolvedValue('tok_test_mock')
  jest.mocked(payTransaction).mockReset().mockResolvedValue(record)
  jest.mocked(checkPayment).mockReset().mockResolvedValue(record)
})

test('recorre catálogo real, registra cliente, cotiza y crea una sola transacción pendiente', async () => {
  const view = open('/productos')
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('link', { name: 'Ver producto' })[0])
  expect(await screen.findByText('Unidades disponibles: 10')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('link', { name: 'Comprar con tarjeta' }))
  expect(await screen.findByRole('heading', { name: 'Tarjeta y entrega' })).toBeInTheDocument()
  expect(screen.getByText(/Esta compra es de prueba: no se realizará ningún cobro real/)).toBeInTheDocument()
  expect(await screen.findByRole('checkbox', { name: /política de privacidad/i })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Guardar y ver resumen' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i }))
  fireEvent.change(screen.getByLabelText('Nombre', { exact: true }), { target: { value: 'Cliente Ejemplo' } })
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'cliente@example.test' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3000000000' } })
  fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 1' } })
  fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Bogotá' } })
  fireEvent.change(screen.getByLabelText('Departamento'), { target: { value: 'Cundinamarca' } })
  fireEvent.change(screen.getByLabelText('Número de tarjeta'), { target: { value: '4242 4242 4242 4242' } })
  fireEvent.change(screen.getByLabelText('Nombre del titular'), { target: { value: 'Cliente Ejemplo' } })
  fireEvent.change(screen.getByLabelText('Mes de vencimiento'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Año de vencimiento'), { target: { value: '35' } })
  fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y ver resumen' }))
  await waitFor(() => expect(createCustomer).toHaveBeenCalledWith({
    name: 'Cliente Ejemplo', email: 'cliente@example.test', phone: '3000000000',
  }))
  expect(await screen.findByRole('heading', { name: 'Resumen de compra' })).toBeInTheDocument()
  expect(screen.getByText(/Si el total cambia antes de pagar, te pediremos que lo confirmes de nuevo/)).toBeInTheDocument()
  await waitFor(() => expect(quoteTransaction).toHaveBeenCalledWith(1, 2))
  expect(await screen.findByText(/506[.,]500/)).toBeInTheDocument()
  const confirm = screen.getByRole('button', { name: 'Simular pago' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  expect(confirm).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  fireEvent.click(confirm)
  expect(screen.getByRole('button', { name: 'Procesando pago…' })).toBeDisabled()
  fireEvent.click(confirm)
  expect(await screen.findByRole('heading', { name: 'Compra pendiente de confirmación' })).toBeInTheDocument()
  expect(createTransaction).toHaveBeenCalledTimes(1)
  expect(createTransaction).toHaveBeenCalledWith(1, 7, 2, expect.any(String))
  expect(payTransaction).toHaveBeenCalledTimes(1)
  expect(tokenizeCard).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('payment-checkout-progress-v1')).not.toMatch(/4242|123|cvc|cardNumber|tok_test_mock|privacyAccepted|personalAccepted/i)
  view.unmount()
  const restored = createAppStore()
  expect(restored.getState().checkout.idempotencyKey).toBeTruthy()
  expect(restored.getState().transaction.record).toBeNull()
  open('/resultado/1')
  expect(await screen.findByText('Referencia: ref-test')).toBeInTheDocument()
  expect(getTransaction).toHaveBeenCalledWith(18)
})

test('el icono del carrito muestra unidades agregadas, cambios de cantidad y recupera el número tras refresh', async () => {
  const view = open('/productos')
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Carrito: 0 unidades' })).toHaveTextContent('0')
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al carrito' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al carrito' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al carrito' })[1])
  const cart = screen.getByRole('link', { name: 'Carrito: 3 unidades' })
  expect(cart).toHaveAttribute('href', '/carrito')
  fireEvent.click(cart)
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar Audífonos Pro' }))
  expect(screen.getByRole('link', { name: 'Carrito: 4 unidades' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Disminuir Audífonos Pro' }))
  expect(screen.getByRole('link', { name: 'Carrito: 3 unidades' })).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])
  expect(screen.getByRole('link', { name: 'Carrito: 1 unidad' })).toBeInTheDocument()
  view.unmount()
  open('/productos')
  expect(screen.getByRole('link', { name: 'Carrito: 1 unidad' })).toHaveTextContent('1')
})

test('busca productos por nombre y descripción, ignorando mayúsculas y acentos', async () => {
  open('/productos')
  await screen.findByText('Tercer producto')
  const search = screen.getByRole('searchbox', { name: 'Buscar productos' })
  fireEvent.change(search, { target: { value: 'TECLADO' } })
  expect(screen.getByRole('heading', { name: 'Teclado' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Mouse' })).not.toBeInTheDocument()
  fireEvent.change(search, { target: { value: 'audifonos' } })
  expect(screen.getByRole('heading', { name: 'Audífonos Pro' })).toBeInTheDocument()
  fireEvent.change(search, { target: { value: 'tercer' } })
  expect(screen.getByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Teclado' })).not.toBeInTheDocument()
  expect(screen.getByText('1 de 3 productos')).toBeInTheDocument()
})

test('filtra por disponibilidad y precio, y permite limpiar filtros sin resultados', async () => {
  jest.mocked(getProducts).mockResolvedValueOnce([{ ...products[0], stock: 0 }, ...products.slice(1)])
  open('/productos')
  await screen.findByText('Tercer producto')
  fireEvent.change(screen.getByRole('combobox', { name: 'Disponibilidad' }), { target: { value: 'disponibles' } })
  expect(screen.queryByRole('heading', { name: 'Audífonos Pro' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio máximo (COP)' }), { target: { value: '200000' } })
  expect(screen.getByRole('heading', { name: 'Mouse' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Teclado' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Disponibilidad' }), { target: { value: 'agotados' } })
  expect(screen.getByText('No encontramos productos con esos filtros.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(screen.getAllByRole('button', { name: 'Agregar al carrito' })).toHaveLength(3)
  expect(screen.getByRole('combobox', { name: 'Disponibilidad' })).toHaveValue('todos')
})

test('las tarjetas aparecen al entrar en pantalla tanto al bajar como al subir', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  let notify: IntersectionObserverCallback = () => {}
  const observe = jest.fn()
  const disconnect = jest.fn()
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: class {
    constructor(callback: IntersectionObserverCallback) { notify = callback }
    observe = observe
    disconnect = disconnect
  } })
  try {
    const view = open('/productos')
    await screen.findByText('Tercer producto')
    const grid = view.container.querySelector('.product-grid')!
    const cards = Array.from(grid.querySelectorAll('.product-arrival'))
    expect(grid).toHaveClass('reveal-active')
    expect(observe).toHaveBeenCalledTimes(products.length)
    act(() => notify([{ target: cards[0], isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(cards[0]).toHaveClass('is-visible')
    act(() => notify([{ target: cards[0], isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(cards[0]).not.toHaveClass('is-visible')
    act(() => notify([{ target: cards[0], isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(cards[0]).toHaveClass('is-visible')
    view.unmount()
    expect(disconnect).toHaveBeenCalled()
  } finally {
    if (original) Object.defineProperty(globalThis, 'IntersectionObserver', original)
    else Reflect.deleteProperty(globalThis, 'IntersectionObserver')
  }
})

test('muestra los productos sin ocultarlos si se prefiere reducir el movimiento', async () => {
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  const observer = jest.fn()
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: observer })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
  try {
    const view = open('/productos')
    await screen.findByText('Tercer producto')
    expect(view.container.querySelector('.product-grid')).not.toHaveClass('reveal-active')
    expect(observer).not.toHaveBeenCalled()
    view.unmount()
  } finally {
    if (originalObserver) Object.defineProperty(globalThis, 'IntersectionObserver', originalObserver)
    else Reflect.deleteProperty(globalThis, 'IntersectionObserver')
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia)
    else Reflect.deleteProperty(window, 'matchMedia')
  }
})

test('volver al catálogo y al carrito usa botones visibles', async () => {
  open('/carrito')
  await screen.findByText('Tu carrito está vacío.')
  fireEvent.click(screen.getByRole('link', { name: 'Ver productos' }))
  const add = await screen.findAllByRole('button', { name: 'Agregar al carrito' })
  fireEvent.click(add[0])
  fireEvent.click(screen.getByRole('link', { name: 'Carrito: 1 unidad' }))
  expect(screen.getByRole('link', { name: '← Seguir comprando' })).toHaveClass('button', 'button-secondary')
  await waitFor(() => expect(screen.getByRole('link', { name: 'Continuar compra' })).toHaveAttribute('aria-disabled', 'false'))
  fireEvent.click(screen.getByRole('link', { name: 'Continuar compra' }))
  expect(await screen.findByRole('link', { name: '← Volver al carrito' })).toHaveClass('button', 'button-secondary')
})

test('el detalle presenta volver al catálogo y ver carrito como botones', async () => {
  open('/productos/1')
  const back = await screen.findByRole('link', { name: '← Todos los productos' })
  expect(back).toHaveClass('button', 'button-secondary')
  expect(screen.getByRole('link', { name: 'Ver carrito' })).toHaveClass('button', 'button-secondary')
})

test('avisa al agregar desde el catálogo, renueva el aviso y lo oculta después', async () => {
  open('/productos')
  const buttons = await screen.findAllByRole('button', { name: 'Agregar al carrito' })
  jest.useFakeTimers()
  try {
    fireEvent.click(buttons[0])
    expect(screen.getByText('Audífonos Pro se añadió al carrito')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Carrito: 1 unidad' })).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(2000))
    fireEvent.click(buttons[1])
    expect(screen.getByText('Teclado se añadió al carrito')).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(2000))
    expect(screen.getByText('Teclado se añadió al carrito')).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(1000))
    expect(screen.queryByText('Teclado se añadió al carrito')).not.toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('avisa también al agregar desde el detalle del producto', async () => {
  open('/productos/1')
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar al carrito' }))
  expect(screen.getByRole('status')).toHaveTextContent('Audífonos Pro se añadió al carrito')
})

test('no ofrece continuar una compra anterior si el carrito está vacío', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 3, productId: 1,
    cart: { items: [] }, checkout: { step: 'checkout' }, transaction: {} }))
  open('/productos')
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Carrito: 0 unidades' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Continuar compra anterior' })).not.toBeInTheDocument()
})

test('ofrece continuar una compra anterior si hay productos en el carrito', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 3, productId: 1,
    cart: { items: [{ productId: 1, name: products[0].name, price: products[0].price,
      image: null, stock: 10, quantity: 1 }] }, checkout: { step: 'checkout' }, transaction: {} }))
  open('/productos')
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continuar compra anterior' })).toHaveAttribute('href', '/checkout/1')
})

test('el indicador no aumenta al superar el stock disponible', async () => {
  jest.mocked(getProducts).mockResolvedValueOnce([{ ...products[0], stock: 2 }, ...products.slice(1)])
  open('/productos')
  const add = (await screen.findAllByRole('button', { name: 'Agregar al carrito' }))[0]
  fireEvent.click(add)
  fireEvent.click(add)
  expect(add).toBeDisabled()
  fireEvent.click(add)
  expect(screen.getByRole('link', { name: 'Carrito: 2 unidades' })).toBeInTheDocument()
})

test('carrito informa error de catálogo y permite reintentar', async () => {
  jest.mocked(getProducts).mockRejectedValueOnce(new Error('offline'))
  open('/carrito')
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Tu carrito está vacío.')).toBeInTheDocument()
})

test('carrito vacío, agregar dos productos, modificar cantidades, persistir y entrar al checkout', async () => {
  const view = open('/carrito')
  expect(await screen.findByText('Tu carrito está vacío.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Ver productos' }))
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al carrito' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al carrito' })[1])
  fireEvent.click(screen.getByRole('link', { name: 'Carrito: 2 unidades' }))
  expect(await screen.findByRole('heading', { name: 'Carrito' })).toBeInTheDocument()
  expect(screen.getByText('Verás la tarifa de servicio, el envío y el total antes de confirmar tu pago.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar Audífonos Pro' }))
  expect(screen.getByText('Cantidad: 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Disminuir Audífonos Pro' }))
  expect(screen.getAllByText('Cantidad: 1')).toHaveLength(2)
  expect(createAppStore().getState().cart.items).toHaveLength(2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0])
  expect(screen.getByRole('link', { name: 'Continuar compra' })).toHaveAttribute('href', '/checkout/2')
  fireEvent.click(screen.getByRole('link', { name: 'Continuar compra' }))
  expect(await screen.findByRole('heading', { name: 'Tarjeta y entrega' })).toBeInTheDocument()
  view.unmount()
  expect(createAppStore().getState().cart.items[0].productId).toBe(2)
})

test('el resumen no presenta una orden pendiente como pago confirmado', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 3, productId: 1,
    checkout: { step: 'resumen', clientId: 7 }, transaction: { id: 18, reference: 'ref-test' } }))
  open('/resumen/1')
  expect(await screen.findByRole('heading', { name: 'Detalle de la compra' })).toBeInTheDocument()
  expect(getTransaction).toHaveBeenCalledWith(18)
  expect(screen.queryByText(/La orden ya existe/)).not.toBeInTheDocument()
  expect(screen.queryByText(/El pago fue aprobado|El pago fue rechazado/)).not.toBeInTheDocument()
})

test.each([['APROBADA', 'aprobado'], ['RECHAZADA', 'rechazado']] as const)(
  'el resumen muestra el resultado cuando la orden está %s', async (status, label) => {
    localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 3, productId: 1,
      checkout: { step: 'resumen', clientId: 7 }, transaction: { id: 18, reference: 'ref-test' } }))
    jest.mocked(getTransaction).mockResolvedValue({ ...record, status })
    open('/resumen/1')
    expect(await screen.findByText(`El pago fue ${label}.`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Consultar estado' })).toHaveAttribute('href', '/resultado/1')
    expect(screen.queryByText(/La orden ya existe/)).not.toBeInTheDocument()
  },
)

test('resumen de carrito usa cotización del backend y crea una orden con todos los productos', async () => {
  const items = products.slice(0, 2).map((product, index) => ({ productId: product.id, name: product.name,
    price: product.price, image: product.image, stock: product.stock, quantity: index === 0 ? 2 : 1 }))
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 3, productId: 1,
    cart: { items }, checkout: { clientId: 7, quantity: 1, step: 'resumen', customer: { name: 'Ana', email: 'ana@example.test', phone: '300' },
      delivery: { address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca', postalCode: '' } }, transaction: {} }))
  jest.mocked(createCartTransaction).mockResolvedValue({ ...record, items: [
    { productId: 1, quantity: 2, unitPrice: '250000.00', subtotal: '500000.00' },
    { productId: 2, quantity: 1, unitPrice: '320000.00', subtotal: '320000.00' }], subtotal: '820000.00', total: '826500.00' })
  saveCard({ number: '4242 4242 4242 4242', holder: 'Ana', month: '12', year: '35', cvc: '123', installments: 1 })
  open('/resumen/1')
  expect(await screen.findByText(/Teclado · 1 unidad ·/)).toBeInTheDocument()
  expect(quoteCart).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ productId: 2, quantity: 1 })]))
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Simular pago' }))
  expect(await screen.findByRole('heading', { name: 'Compra pendiente de confirmación' })).toBeInTheDocument()
  expect(createCartTransaction).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ productId: 2, quantity: 1 })]), 7, expect.any(String))
  expect(createTransaction).not.toHaveBeenCalled()
  expect(localStorage.getItem('payment-checkout-progress-v1')).not.toMatch(/4242|cvc|tok_test_mock/i)
})

test('si el backend cambia el total al crear la orden exige confirmación nueva antes de tokenizar', async () => {
  const item = { productId: 1, name: products[0].name, price: products[0].price, image: null, stock: 10, quantity: 2 }
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 3, productId: 1,
    cart: { items: [item] }, checkout: { clientId: 7, step: 'resumen',
      delivery: { address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca' } }, transaction: {} }))
  jest.mocked(createCartTransaction).mockResolvedValue({ ...record, total: '826501.00' })
  saveCard({ number: '4242 4242 4242 4242', holder: 'Ana', month: '12', year: '35', cvc: '123', installments: 1 })
  open('/resumen/1')
  await screen.findByRole('heading', { name: 'Detalle de la compra' })
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Simular pago' }))
  expect(await screen.findByText(/El importe cambió al crear la orden/)).toBeInTheDocument()
  expect(tokenizeCard).not.toHaveBeenCalled()
  expect(payTransaction).not.toHaveBeenCalled()
})

test('volver al catálogo borra cualquier tarjeta abandonada en memoria', async () => {
  saveCard({ number: '4242 4242 4242 4242', holder: 'Cliente Ejemplo', month: '12', year: '35', cvc: '123', installments: 1 })
  expect(getCard()).not.toBeNull()
  open('/productos')
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
  expect(getCard()).toBeNull()
})

test('documentos actualizados invalidan el consentimiento anterior sin persistirlo', () => {
  const appStore = createAppStore()
  appStore.dispatch(setAcceptanceDocuments({ privacy: 'https://example.test/privacy', personal: 'https://example.test/personal' }))
  appStore.dispatch(acceptPrivacy(true))
  appStore.dispatch(acceptPersonal(true))
  appStore.dispatch(setAcceptanceDocuments({ privacy: 'https://example.test/new', personal: 'https://example.test/personal' }))
  expect(appStore.getState().checkout.privacyAccepted).toBe(false)
  expect(appStore.getState().checkout.personalAccepted).toBe(false)
  expect(localStorage.getItem('payment-checkout-progress-v1')).not.toMatch(/privacyAccepted|personalAccepted|acceptedDocuments/i)
})

test('refresh de selección recupera producto, cantidad y stock actual del backend', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { quantity: 2, step: 'producto' }, transaction: {} }))
  jest.mocked(getProduct).mockResolvedValue({ ...products[0], stock: 9 })
  open('/productos/1')
  expect(await screen.findByText('Unidades disponibles: 9')).toBeInTheDocument()
  expect(screen.getByLabelText('Cantidad')).toHaveValue(2)
  expect(screen.getByRole('link', { name: 'Comprar con tarjeta' })).toBeInTheDocument()
  expect(getProduct).toHaveBeenCalledWith(1)
})

test('volver al producto con una orden aprobada recuperada permite comprar otra vez', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { clientId: 7, step: 'resultado' }, transaction: { id: 18, reference: 'ref-test' } }))
  jest.mocked(getTransaction).mockResolvedValue({ ...record, status: 'APROBADA' })
  jest.mocked(getProduct).mockResolvedValue({ ...products[0], stock: 9 })
  open('/productos/1')
  expect(await screen.findByText('Unidades disponibles: 9')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Comprar con tarjeta' })).toBeInTheDocument()
})

test('producto con orden realmente pendiente ofrece continuar sin duplicar compra', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { clientId: 7, step: 'resultado' }, transaction: { id: 18, reference: 'ref-test' } }))
  open('/productos/1')
  expect(await screen.findByRole('link', { name: 'Continuar compra pendiente' })).toHaveAttribute('href', '/checkout/1')
  expect(screen.queryByRole('link', { name: 'Comprar con tarjeta' })).not.toBeInTheDocument()
  expect(createTransaction).not.toHaveBeenCalled()
})

test('refresh del checkout restaura entrega pero requiere volver a escribir la tarjeta', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { customer: { name: 'Cliente Ejemplo', email: 'cliente@example.test', phone: '3000000000' },
      delivery: { address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca', postalCode: '' },
      clientId: 7, step: 'checkout' }, transaction: {} }))
  open('/checkout/1')
  expect(await screen.findByRole('heading', { name: 'Tarjeta y entrega' })).toBeInTheDocument()
  expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 1')
  expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('')
  expect(screen.getByLabelText('CVC')).toHaveValue('')
  expect(await screen.findByRole('checkbox', { name: /política de privacidad/i })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Guardar y ver resumen' })).toBeDisabled()
})

test('checkout muestra error de documentos y permite reintentar sin registrar cliente', async () => {
  jest.mocked(getPaymentTerms).mockRejectedValueOnce(new Error('offline'))
  open('/checkout/1')
  expect(await screen.findByRole('button', { name: 'Reintentar documentos' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar y ver resumen' })).toBeDisabled()
  expect(createCustomer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar documentos' }))
  expect(await screen.findByRole('checkbox', { name: /política de privacidad/i })).not.toBeChecked()
})

test('resumen permite reintentar documentos fallidos sin enviar un pago', async () => {
  jest.mocked(getPaymentTerms).mockRejectedValueOnce(new Error('offline'))
  open('/resumen/1')
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar documentos' }))
  expect(await screen.findByRole('checkbox', { name: /política de privacidad/i })).not.toBeChecked()
  expect(payTransaction).not.toHaveBeenCalled()
})

test('refresh del resumen recupera importe y entrega pero exige nueva aceptación y tarjeta', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { quantity: 2, clientId: 7, step: 'resumen',
      customer: { name: 'Cliente Ejemplo', email: 'cliente@example.test', phone: '3000000000' },
      delivery: { address: 'Calle 1', city: 'Bogotá', department: 'Cundinamarca', postalCode: '' } }, transaction: {} }))
  open('/resumen/1')
  expect(await screen.findByRole('heading', { name: 'Resumen de compra' })).toBeInTheDocument()
  expect(await screen.findByText(/506[.,]500/)).toBeInTheDocument()
  const privacy = await screen.findByRole('checkbox', { name: /política de privacidad/i })
  expect(privacy).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i })).not.toBeChecked()
  fireEvent.click(privacy)
  fireEvent.click(screen.getByRole('checkbox', { name: /tratamiento de datos personales/i }))
  const confirm = screen.getByRole('button', { name: 'Simular pago' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(confirm)
  expect(await screen.findByText(/Vuelve a los datos de pago e introduce tu tarjeta/i)).toBeInTheDocument()
  expect(createTransaction).not.toHaveBeenCalled()
  expect(tokenizeCard).not.toHaveBeenCalled()
  expect(payTransaction).not.toHaveBeenCalled()
})

test.each(['APROBADA', 'RECHAZADA'] as const)('recupera resultado %s después de refresh sin persistir tarjeta', async (status) => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { idempotencyKey: 'ef3b98af-a0c7-410b-bf32-3f126709aed1' },
    transaction: { id: 18, reference: 'ref-test' } }))
  jest.mocked(checkPayment).mockResolvedValue({ ...record, status })
  if (status === 'APROBADA') jest.mocked(getProduct).mockResolvedValue({ ...products[0], stock: 9 })
  open('/resultado/1')
  expect(await screen.findByRole('heading', { name: status === 'APROBADA' ? 'Pago aprobado' : 'Pago rechazado' })).toBeInTheDocument()
  expect(checkPayment).toHaveBeenCalledWith(18, expect.any(String))
  fireEvent.click(screen.getByRole('link', { name: 'Volver al producto' }))
  expect(await screen.findByText(`Unidades disponibles: ${status === 'APROBADA' ? 9 : 10}`)).toBeInTheDocument()
  expect(localStorage.getItem('payment-checkout-progress-v1')).not.toMatch(/4242|cvc|tok_test_mock/i)
})

test.each(['APROBADA', 'RECHAZADA'] as const)('muestra resultado %s de carrito aunque la ruta use otro producto de la orden', async (status) => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 2,
    checkout: { idempotencyKey: 'ef3b98af-a0c7-410b-bf32-3f126709aed1' },
    transaction: { id: 18, reference: 'ref-test' } }))
  jest.mocked(checkPayment).mockResolvedValue({ ...record, status, items: [
    { productId: 1, quantity: 1, unitPrice: '250000.00', subtotal: '250000.00' },
    { productId: 2, quantity: 1, unitPrice: '320000.00', subtotal: '320000.00' }] })
  open('/resultado/2')
  expect(await screen.findByRole('heading', { name: status === 'APROBADA' ? 'Pago aprobado' : 'Pago rechazado' })).toBeInTheDocument()
  expect(screen.getByText('Referencia: ref-test')).toBeInTheDocument()
})

test('resultado recupera un error de consulta sin crear un nuevo pago', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { idempotencyKey: 'ef3b98af-a0c7-410b-bf32-3f126709aed1' },
    transaction: { id: 18, reference: 'ref-test' } }))
  jest.mocked(checkPayment).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(record)
  open('/resultado/1')
  expect(await screen.findByRole('button', { name: 'Reintentar consulta' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
  expect(await screen.findByRole('heading', { name: 'Compra pendiente de confirmación' })).toBeInTheDocument()
  expect(payTransaction).not.toHaveBeenCalled()
})

test('muestra estados de carga, lista vacía y error recuperable', async () => {
  jest.mocked(getProducts).mockResolvedValueOnce([])
  const view = open('/productos')
  expect(await screen.findByText('No hay productos disponibles.')).toBeInTheDocument()
  view.unmount()
  jest.mocked(getProducts).mockRejectedValueOnce(new Error('Falló conexión'))
  open('/productos')
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Tercer producto')).toBeInTheDocument()
})
