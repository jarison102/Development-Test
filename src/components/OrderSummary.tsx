import type { Product } from '../types/product'
import type { PurchaseSummary } from '../types/checkout'
import { formatCurrency } from '../utils/formatCurrency'

export function OrderSummary({ product, summary }: { product: Product; summary: PurchaseSummary }) {
  return (
    <section className="panel" aria-labelledby="order-heading">
      <h2 id="order-heading">Detalle de la compra</h2>
      <dl className="totals">
        <div><dt>{product.name} · {summary.quantity} {summary.quantity === 1 ? 'unidad' : 'unidades'}</dt><dd>{formatCurrency(summary.subtotal)}</dd></div>
        <div><dt>Tarifa base</dt><dd>{formatCurrency(summary.baseFee)}</dd></div>
        <div><dt>Envío</dt><dd>{formatCurrency(summary.shippingFee)}</dd></div>
        <div className="total-row"><dt>Total</dt><dd>{formatCurrency(summary.total)}</dd></div>
      </dl>
      <p className="caption">Importes del backend. La cotización se vuelve a validar al crear la transacción.</p>
    </section>
  )
}