import { t } from '../lib/i18n'

/**
 * The product thesis, drawn.
 *
 * A patient journey that crosses the discharge line and keeps going: solid
 * while the hospital holds responsibility, dotted once care moves home, and
 * running off the bottom edge because the record does not end.
 *
 * Illustrative, not a real record. No patient is named here.
 */

interface Step {
  date: string
  label: string
  detail?: string
  phase: 'hospital' | 'home'
  marker: 'dot' | 'discharge' | 'attention'
}

const steps: Step[] = [
  { date: '20 сен', label: t.journey.admitted, detail: t.journey.admittedDetail, phase: 'hospital', marker: 'dot' },
  { date: '21 сен', label: t.journey.surgery, phase: 'hospital', marker: 'dot' },
  { date: '24 сен', label: t.journey.discharged, detail: t.journey.dischargedDetail, phase: 'home', marker: 'discharge' },
  { date: '25 сен', label: t.journey.checkIn, detail: t.journey.checkInDetail, phase: 'home', marker: 'dot' },
  { date: t.journey.today, label: t.journey.deterioration, detail: t.journey.deteriorationDetail, phase: 'home', marker: 'attention' },
]

const Marker: React.FC<{ kind: Step['marker']; phase: Step['phase'] }> = ({ kind, phase }) => {
  const color = phase === 'hospital' ? 'var(--color-phase-hospital)' : 'var(--color-phase-home)'

  if (kind === 'discharge') {
    return (
      <span
        className="relative z-10 mt-1.5 block size-3 rotate-45 border-2 bg-panel"
        style={{ borderColor: color, marginLeft: '-1px' }}
      />
    )
  }

  if (kind === 'attention') {
    return <span className="relative z-10 mt-2 block size-3 rounded-full bg-risk-high ring-4 ring-risk-high/25" />
  }

  return (
    <span
      className="relative z-10 mt-2 block size-3 rounded-full border-2 bg-panel"
      style={{ borderColor: color }}
    />
  )
}

export const ContinuitySpine: React.FC = () => (
  <ol className="spine">
    {steps.map((step) => (
      <li
        key={step.label}
        data-phase={step.phase}
        className="spine-step relative grid grid-cols-[12px_1fr] gap-x-5 pb-7"
      >
        <Marker kind={step.marker} phase={step.phase} />
        <div className="-mt-0.5">
          <p className="text-[0.9375rem] leading-snug text-panel-ink">{step.label}</p>
          <p className="tabular mt-0.5 text-[0.8125rem] leading-snug text-panel-muted">
            {step.date}
            {step.detail ? ` — ${step.detail}` : ''}
          </p>
        </div>
      </li>
    ))}
    <li className="spine-tail relative h-16" aria-hidden="true" />
  </ol>
)
