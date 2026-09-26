import { createAppStore } from './store'
import { addProduct, clearCart, decreaseQuantity, increaseQuantity, removeProduct } from './cartSlice'
import { cartSubtotal, cartTotal } from './cartTotals'
import { STORAGE_KEY, loadPersistedState, saveProgress } from './persistence'
import { fetchProduct, fetchProducts, selectProduct } from './productSlice'
import { selectCurrentProduct, selectPurchaseSummary } from './selectors'
import { clearTransaction, refreshTransaction, submitTransaction, verifyPayment } from './transactionSlice'
import { acceptPersonal, acceptPrivacy, fetchQuote, registerCustomer, setQuantity, updateCustomer, updateDelivery }
  from './checkoutSlice'
import { createCustomer } from '../services/clientes.service'
import { createTransaction, getTransaction, quoteTransaction } from '../services/transacciones.service'
import { checkPayment } from '../services/payments.service'

jest.mock('../services/config', () => ({ apiUrl: 'http://localhost:3000/api' }))
jest.mock('../services/clientes.service')
jest.mock('../services/transacciones.service')
jest.mock('../services/payments.service')

const product = { id: 1, name: 'Audífonos', description: 'D', price: '250000.00', stock: 9, image: null }
const quote = { productId: 1, quantity: 2, subtotal: '500000.00', baseFee: '1500.00',
  shippingFee: '5000.00', total: '506500.00' }
const record = { id: 18, reference: 'ref-1', productId: 1, customerId: 7, quantity: 2,
  subtotal: '500000.00', baseFee: '1500.00', shippingFee: '5000.00', total: '506500.00',
  status: 'PENDIENTE' as const, externalId: null }

beforeEach(() => {
  localStorage.clear()
  jest.mocked(getTransaction).mockReset().mockResolvedValue(record)
  jest.mocked(createTransaction).mockReset().mockResolvedValue(record)
  jest.mocked(checkPayment).mockReset().mockResolvedValue(record)
  jest.mocked(quoteTransaction).mockReset().mockResolvedValue(quote)
  jest.mocked(createCustomer).mockReset().mockResolvedValue(7)
})

describe('selectores', () => {
  it('encuentra el producto seleccionado y devuelve null sin selección', () => {
    const appStore = createAppStore()
    appStore.dispatch(fetchProducts.fulfilled([product], '', undefined))
    expect(selectCurrentProduct(appStore.getState())).toBeNull()
    appStore.dispatch(selectProduct(1))
    expect(selectCurrentProduct(appStore.getState())).toEqual(product)
    expect(selectPurchaseSummary(appStore.getState())).toBeNull()
    appStore.dispatch(setQuantity(2))
    appStore.dispatch(fetchQuote.pending('req', { productId: 1, quantity: 2 }))
    appStore.dispatch(fetchQuote.fulfilled(quote, 'req', { productId: 1, quantity: 2 }))
    expect(selectPurchaseSummary(appStore.getState())).toEqual(quote)
  })

  it('ignora seleccionar un producto que no está en el catálogo', () => {
    const appStore = createAppStore()
    appStore.dispatch(fetchProducts.fulfilled([product], '', undefined))
    appStore.dispatch(selectProduct(99))
    expect(appStore.getState().product.selectedId).toBeNull()
  })

  it('limpia la selección si el producto desaparece del catálogo', () => {
    const appStore = createAppStore()
    appStore.dispatch(fetchProducts.fulfilled([product], '', undefined))
    appStore.dispatch(selectProduct(1))
    appStore.dispatch(fetchProducts.fulfilled([], '', undefined))
    expect(appStore.getState().product.selectedId).toBeNull()
  })

  it('fetchProduct actualiza un producto existente y añade uno nuevo', () => {
    const appStore = createAppStore()
    appStore.dispatch(fetchProduct.fulfilled(product, 'r1', 1))
    appStore.dispatch(fetchProduct.fulfilled({ ...product, stock: 8 }, 'r2', 1))
    expect(appStore.getState().product.items).toHaveLength(1)
    expect(appStore.getState().product.items[0].stock).toBe(8)
    appStore.dispatch(fetchProduct.fulfilled({ ...product, id: 2 }, 'r3', 2))
    expect(appStore.getState().product.items).toHaveLength(2)
  })

  it('usa el mensaje por defecto cuando el thunk falla sin detalle', () => {
    const appStore = createAppStore()
    appStore.dispatch(fetchProducts.rejected(new Error('x'), 'r', undefined))
    expect(appStore.getState().product.error).toBe('No se pudieron cargar los productos.')
    appStore.dispatch(fetchProduct.rejected(new Error('x'), 'r', 1))
    expect(appStore.getState().product.error).toBe('No se pudo cargar el producto.')
  })
})

describe('checkoutSlice', () => {
  it('setQuantity solo acepta enteros positivos y reinicia la cotización', () => {
    const appStore = createAppStore()
    appStore.dispatch(setQuantity(2))
    expect(appStore.getState().checkout.quantity).toBe(2)
    appStore.dispatch(setQuantity(0))
    appStore.dispatch(setQuantity(-3))
    appStore.dispatch(setQuantity(1.5))
    expect(appStore.getState().checkout.quantity).toBe(2)
  })

  it('updateCustomer reinicia cliente e idempotencia; updateDelivery conserva campos', () => {
    const appStore = createAppStore()
    appStore.dispatch(updateCustomer({ name: 'Ana' }))
    appStore.dispatch(registerCustomer.fulfilled(7, 'r'))
    appStore.dispatch(updateCustomer({ email: 'ana@e.test' }))
    const state = appStore.getState().checkout
    expect(state.customer.name).toBe('Ana')
    expect(state.customer.email).toBe('ana@e.test')
    expect(state.clientId).toBeNull()
    expect(state.idempotencyKey).toBeNull()
    appStore.dispatch(updateDelivery({ city: 'Cali' }))
    expect(appStore.getState().checkout.delivery.city).toBe('Cali')
  })

  it('mismos documentos no reinician consentimientos ya marcados', () => {
    const appStore = createAppStore()
    const docs = { privacy: 'https://e.test/p', personal: 'https://e.test/d' }
    appStore.dispatch({ type: 'checkout/setAcceptanceDocuments', payload: docs })
    appStore.dispatch(acceptPrivacy(true))
    appStore.dispatch(acceptPersonal(true))
    appStore.dispatch({ type: 'checkout/setAcceptanceDocuments', payload: docs })
    expect(appStore.getState().checkout.privacyAccepted).toBe(true)
  })

  it('ignora una cotización que llega fuera de tiempo o con cantidad distinta', () => {
    const appStore = createAppStore()
    appStore.dispatch(fetchQuote.pending('req-a', { productId: 1, quantity: 1 }))
    appStore.dispatch(fetchQuote.fulfilled(quote, 'req-b', { productId: 1, quantity: 2 }))
    expect(appStore.getState().checkout.quote).toBeNull()
    expect(appStore.getState().checkout.quoteStatus).toBe('loading')
    appStore.dispatch(fetchQuote.rejected(new Error('x'), 'req-b', { productId: 1, quantity: 2 }))
    expect(appStore.getState().checkout.quoteStatus).toBe('loading')
    appStore.dispatch(fetchQuote.rejected(new Error('x'), 'req-a', { productId: 1, quantity: 1 }))
    expect(appStore.getState().checkout.quoteStatus).toBe('failed')
    expect(appStore.getState().checkout.quoteError).toBe('No se pudo calcular el resumen.')
  })

  it('registerCustomer no se repite si ya existe clientId', async () => {
    const appStore = createAppStore()
    appStore.dispatch(updateCustomer({ name: 'Ana', email: 'a@e.test', phone: '300' }))
    await appStore.dispatch(registerCustomer())
    expect(appStore.getState().checkout.clientId).toBe(7)
    await appStore.dispatch(registerCustomer())
    expect(createCustomer).toHaveBeenCalledTimes(1)
  })

  it('registerCustomer informa el error del servicio', async () => {
    jest.mocked(createCustomer).mockRejectedValue(new Error('red'))
    const appStore = createAppStore()
    await appStore.dispatch(registerCustomer())
    expect(appStore.getState().checkout.clientStatus).toBe('failed')
    expect(appStore.getState().checkout.clientError).toBeTruthy()
  })
})

describe('transactionSlice', () => {
  it('exige cliente y resumen antes de crear la transacción', async () => {
    const appStore = createAppStore()
    await appStore.dispatch(submitTransaction())
    expect(appStore.getState().transaction.error).toBe('Completa el cliente y el resumen antes de confirmar.')
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('no crea una segunda transacción si ya existe una', async () => {
    const appStore = createAppStore()
    appStore.dispatch(selectProduct(1))
    appStore.dispatch(fetchProducts.fulfilled([product], '', undefined))
    appStore.dispatch(selectProduct(1))
    appStore.dispatch(updateCustomer({ name: 'Ana' }))
    appStore.dispatch(registerCustomer.fulfilled(7, 'r'))
    appStore.dispatch(fetchQuote.pending('req', { productId: 1, quantity: 1 }))
    appStore.dispatch(fetchQuote.fulfilled({ ...quote, quantity: 1 }, 'req', { productId: 1, quantity: 1 }))
    await appStore.dispatch(submitTransaction())
    expect(appStore.getState().transaction.id).toBe(18)
    await appStore.dispatch(submitTransaction())
    expect(createTransaction).toHaveBeenCalledTimes(1)
  })

  it('ignora respuestas de refresco que no corresponden a la transacción activa', () => {
    const appStore = createAppStore()
    appStore.dispatch(submitTransaction.fulfilled(record, 'r'))
    appStore.dispatch(refreshTransaction.fulfilled({ ...record, id: 99 }, 'r2', 99))
    expect(appStore.getState().transaction.record?.id).toBe(18)
    appStore.dispatch(refreshTransaction.fulfilled({ ...record, status: 'APROBADA' }, 'r3', 18))
    expect(appStore.getState().transaction.record?.status).toBe('APROBADA')
  })

  it('verifyPayment exige la clave de idempotencia persistida', async () => {
    const appStore = createAppStore()
    await appStore.dispatch(verifyPayment(18))
    expect(appStore.getState().transaction.error).toBe('No se puede verificar el pago sin la clave de la orden.')
    expect(checkPayment).not.toHaveBeenCalled()
  })

  it('verifyPayment consulta el backend con la clave y actualiza el estado', async () => {
    const appStore = createAppStore()
    appStore.dispatch({ type: 'checkout/setIdempotencyKey', payload: 'key-uuid' })
    appStore.dispatch(submitTransaction.fulfilled(record, 'r'))
    jest.mocked(checkPayment).mockResolvedValue({ ...record, status: 'APROBADA' })
    await appStore.dispatch(verifyPayment(18))
    expect(checkPayment).toHaveBeenCalledWith(18, 'key-uuid')
    expect(appStore.getState().transaction.record?.status).toBe('APROBADA')
    appStore.dispatch(clearTransaction())
    expect(appStore.getState().transaction.id).toBeNull()
  })

  it('informa errores de consulta con mensaje por defecto', () => {
    const appStore = createAppStore()
    appStore.dispatch(refreshTransaction.rejected(new Error('x'), 'r', 18))
    expect(appStore.getState().transaction.error).toBe('No se pudo consultar la transacción.')
    appStore.dispatch(verifyPayment.rejected(new Error('x'), 'r', 18))
    expect(appStore.getState().transaction.error).toBe('No se pudo verificar el pago.')
    appStore.dispatch(submitTransaction.rejected(new Error('x'), 'r', undefined))
    expect(appStore.getState().transaction.error).toBe('No se pudo crear la transacción.')
  })
})

describe('cartSlice', () => {
  it('agrega, suma hasta stock, reduce y elimina sin aceptar agotados', () => {
    const appStore = createAppStore()
    appStore.dispatch(addProduct({ ...product, stock: 2 }))
    appStore.dispatch(addProduct({ ...product, stock: 2 }))
    appStore.dispatch(increaseQuantity(1))
    expect(appStore.getState().cart.items[0].quantity).toBe(2)
    appStore.dispatch(decreaseQuantity(1))
    appStore.dispatch(decreaseQuantity(1))
    expect(appStore.getState().cart.items[0].quantity).toBe(1)
    appStore.dispatch(addProduct({ ...product, id: 2, price: '100.25' }))
    appStore.dispatch(addProduct({ ...product, id: 3, stock: 0 }))
    expect(appStore.getState().cart.items).toHaveLength(2)
    expect(cartSubtotal(appStore.getState().cart.items[0])).toBe('250000.00')
    expect(cartTotal(appStore.getState().cart.items)).toBe('250100.25')
    appStore.dispatch(removeProduct(1))
    expect(appStore.getState().cart.items).toHaveLength(1)
    appStore.dispatch(clearCart())
    expect(appStore.getState().cart.items).toEqual([])
  })

  it('sincroniza precio y stock del backend después de refresh sin aumentar cantidad', () => {
    const appStore = createAppStore()
    appStore.dispatch(addProduct(product))
    appStore.dispatch(fetchProducts.fulfilled([{ ...product, stock: 0, price: '900.00' }], '', undefined))
    expect(appStore.getState().cart.items[0]).toMatchObject({ stock: 0, price: '900.00', quantity: 1 })
    appStore.dispatch(increaseQuantity(1))
    expect(appStore.getState().cart.items[0].quantity).toBe(1)
  })
})

describe('persistencia', () => {
  it('ignora JSON corrupto, versiones desconocidas y contenido no objeto', () => {
    localStorage.setItem(STORAGE_KEY, '{no-json')
    expect(loadPersistedState()).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 9 }))
    expect(loadPersistedState()).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['a']))
    expect(loadPersistedState()).toBeUndefined()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(42))
    expect(loadPersistedState()).toBeUndefined()
  })

  it('sanea campos: descarta claves inválidas, ids malformados y pasos desconocidos', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, productId: 'no-numero',
      checkout: { quantity: -5, step: 'inexistente', clientId: 'x', idempotencyKey: 'NO-UUID!',
        customer: { name: 42, email: 'a@e.test', phone: {} }, delivery: 'texto' },
      transaction: { id: 'x', reference: 'r' } }))
    const state = loadPersistedState()
    expect(state?.product.selectedId).toBeNull()
    expect(state?.checkout.quantity).toBe(1)
    expect(state?.checkout.step).toBe('producto')
    expect(state?.checkout.clientId).toBeNull()
    expect(state?.checkout.idempotencyKey).toBeNull()
    expect(state?.checkout.customer).toEqual({ name: '', email: 'a@e.test', phone: '' })
    expect(state?.checkout.delivery.address).toBe('')
    expect(state?.transaction.id).toBeNull()
  })

  it('recupera progreso válido y nunca incluye datos de tarjeta', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, productId: 1,
      checkout: { quantity: 2, step: 'resumen', clientId: 7,
        idempotencyKey: 'ef3b98af-a0c7-410b-bf32-3f126709aed1',
        customer: { name: 'Ana', email: 'a@e.test', phone: '300' },
        delivery: { address: 'Calle 1', city: 'Bogotá', department: 'Cund', postalCode: '110111' } },
      transaction: { id: 18, reference: 'ref-1' } }))
    const state = loadPersistedState()
    expect(state?.product.selectedId).toBe(1)
    expect(state?.checkout.step).toBe('resumen')
    expect(state?.checkout.clientId).toBe(7)
    expect(state?.transaction.id).toBe(18)
    expect(state?.transaction.reference).toBe('ref-1')
  })

  it('la transacción solo se restaura si hay producto seleccionado', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, productId: null,
      checkout: {}, transaction: { id: 18, reference: 'ref-1' } }))
    expect(loadPersistedState()?.transaction.id).toBeNull()
  })

  it('persistencia whitelist recupera carrito e ignora campos sensibles inyectados', () => {
    const appStore = createAppStore()
    appStore.dispatch(addProduct({ ...product, stock: 3 }))
    const raw = localStorage.getItem(STORAGE_KEY)!
    expect(JSON.parse(raw).cart.items).toEqual([{
      productId: 1, name: 'Audífonos', price: '250000.00', image: null, stock: 3, quantity: 1,
    }])
    expect(createAppStore().getState().cart.items).toEqual(appStore.getState().cart.items)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(raw), cart: { items: [
      { ...JSON.parse(raw).cart.items[0], cardNumber: '4242', cvc: '123', quantity: 999 },
      { productId: -1, name: 'invalido', price: '0.01', stock: 1, quantity: 1 },
    ] } }))
    expect(loadPersistedState()?.cart.items).toEqual([{ ...appStore.getState().cart.items[0], quantity: 3 }])
    expect(createAppStore().getState().cart.items[0]).not.toHaveProperty('cvc')
  })

  it('saveProgress tolera un storage que lanza y nunca guarda consentimientos', () => {
    const appStore = createAppStore()
    appStore.dispatch(acceptPrivacy(true))
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).not.toMatch(/privacyAccepted|personalAccepted|cardToken|cvc|number/)
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('lleno') })
    expect(() => saveProgress(appStore.getState())).not.toThrow()
    spy.mockRestore()
  })
})
