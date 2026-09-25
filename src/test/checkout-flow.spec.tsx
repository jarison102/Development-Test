import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { createAppStore } from '../store/store'
import { acceptPersonal, acceptPrivacy, setAcceptanceDocuments } from '../store/checkoutSlice'
import { getProduct, getProducts } from '../services/productos.service'
import { createCustomer } from '../services/clientes.service'
import { createTransaction, getTransaction, quoteTransaction } from '../services/transacciones.service'
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
  expect(await screen.findByText('Stock disponible: 10')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('link', { name: 'Comprar con tarjeta' }))
  expect(await screen.findByRole('heading', { name: 'Tarjeta y entrega' })).toBeInTheDocument()
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
  await waitFor(() => expect(quoteTransaction).toHaveBeenCalledWith(1, 2))
  expect(await screen.findByText(/506[.,]500/)).toBeInTheDocument()
  const confirm = screen.getByRole('button', { name: 'Pagar en Sandbox' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  expect(confirm).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /política de privacidad/i }))
  fireEvent.click(confirm)
  expect(screen.getByRole('button', { name: 'Procesando pago…' })).toBeDisabled()
  fireEvent.click(confirm)
  expect(await screen.findByRole('heading', { name: 'Transacción creada - pendiente de pago' })).toBeInTheDocument()
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
  expect(await screen.findByText('Stock disponible: 9')).toBeInTheDocument()
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
  expect(await screen.findByText('Stock disponible: 9')).toBeInTheDocument()
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
  const confirm = screen.getByRole('button', { name: 'Pagar en Sandbox' })
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(confirm)
  expect(await screen.findByText(/Vuelve al checkout e introduce la tarjeta/i)).toBeInTheDocument()
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
  expect(await screen.findByText(`Stock disponible: ${status === 'APROBADA' ? 9 : 10}`)).toBeInTheDocument()
  expect(localStorage.getItem('payment-checkout-progress-v1')).not.toMatch(/4242|cvc|tok_test_mock/i)
})

test('resultado recupera un error de consulta sin crear un nuevo pago', async () => {
  localStorage.setItem('payment-checkout-progress-v1', JSON.stringify({ version: 2, productId: 1,
    checkout: { idempotencyKey: 'ef3b98af-a0c7-410b-bf32-3f126709aed1' },
    transaction: { id: 18, reference: 'ref-test' } }))
  jest.mocked(checkPayment).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(record)
  open('/resultado/1')
  expect(await screen.findByRole('button', { name: 'Reintentar consulta' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
  expect(await screen.findByRole('heading', { name: 'Transacción creada - pendiente de pago' })).toBeInTheDocument()
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
