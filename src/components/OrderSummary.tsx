import type { Product } from '../types/product'
import type { PurchaseSummary } from '../types/checkout'
import { formatCurrency } from '../utils/formatCurrency'

export function OrderSummary({ product, summary, names = [] }: { product: Product; summary: PurchaseSummary; names?: Product[] }) {
  return (
    <section className="panel" aria-labelledby="order-heading">
      <h2 id="order-heading">Detalle de la compra</h2>
      <dl className="totals">
        {summary.items?.length ? summary.items.map((item) => <div key={item.productId}>
          <dt>{names.find((entry) => entry.id === item.productId)?.name ?? `Producto ${item.productId}`} · {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'} · {formatCurrency(item.unitPrice)} c/u</dt>
          <dd>{formatCurrency(item.subtotal)}</dd>
        </div>) : <div><dt>{product.name} · {summary.quantity} {summary.quantity === 1 ? 'unidad' : 'unidades'} · {formatCurrency((Number(summary.subtotal) / summary.quantity).toFixed(2))} c/u</dt><dd>{formatCurrency(summary.subtotal)}</dd></div>}
        {summary.items && <div><dt>Productos</dt><dd>{formatCurrency(summary.subtotal)}</dd></div>}
        <div><dt>Tarifa base</dt><dd>{formatCurrency(summary.baseFee)}</dd></div>
        <div><dt>Envío</dt><dd>{formatCurrency(summary.shippingFee)}</dd></div>
        <div className="total-row"><dt>Total</dt><dd>{formatCurrency(summary.total)}</dd></div>
      </dl>
      <p className="caption">Importes del backend. La cotización se vuelve a validar al crear la transacción.</p>
    </section>
  )
}