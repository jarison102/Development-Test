import type { CheckoutStep } from '../types/checkout'

const steps: { id: CheckoutStep; label: string }[] = [
  { id: 'producto', label: 'Producto' },
  { id: 'checkout', label: 'Entrega' },
  { id: 'resumen', label: 'Resumen' },
  { id: 'resultado', label: 'Resultado' },
]

export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  return (
    <nav aria-label="Progreso de compra" className="steps">
      <ol>
        {steps.map((step, index) => (
          <li key={step.id} aria-current={step.id === current ? 'step' : undefined}>
            <span className="step-number">{index + 1}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
