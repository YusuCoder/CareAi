import type { Point } from '../../lib/simulation'
import { t } from '../../lib/i18n'

export interface Series {
  label: string
  color: string
  points: Point[]
}

interface Props {
  baseline: Point[]
  /** Один вариант лечения… */
  treated?: Point[]
  /** …или несколько — для сравнения кандидатов на одной шкале. */
  series?: Series[]
  unit: string
}

const W = 560
const H = 190
const PAD = { top: 14, right: 12, bottom: 26, left: 40 }

/** Baseline dashed, treated solid. Five years across, in years. */
export const ProjectionChart: React.FC<Props> = ({ baseline, treated, series, unit }) => {
  const lines: Series[] = series ?? (treated ? [{ label: '', color: 'var(--color-primary)', points: treated }] : [])
  const all = [...baseline, ...lines.flatMap((one) => one.points)].map((point) => point.value)
  if (all.length < 2) return null

  const min = Math.min(...all)
  const max = Math.max(...all)
  const pad = (max - min) * 0.2 || 1
  const lo = min - pad
  const hi = max + pad

  const x = (month: number) => PAD.left + (month / 60) * (W - PAD.left - PAD.right)
  const y = (value: number) =>
    H - PAD.bottom - ((value - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)

  const line = (points: Point[]) =>
    points.map((point) => `${x(point.month).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')

  const ticks = [lo, (lo + hi) / 2, hi]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)}
                stroke="var(--color-border)" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={10}
                fill="var(--color-ink-muted)">
            {tick.toFixed(1)}
          </text>
        </g>
      ))}

      {[0, 1, 2, 3, 4, 5].map((year) => (
        <text key={year} x={x(year * 12)} y={H - 8} textAnchor="middle" fontSize={10}
              fill="var(--color-ink-muted)">
          {year}
        </text>
      ))}
      <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill="var(--color-ink-muted)">
        {t.forecast.years}
      </text>

      <polyline points={line(baseline)} fill="none" stroke="var(--color-ink-muted)"
                strokeWidth={1.8} strokeDasharray="5 4" strokeLinecap="round" />
      {lines.map((one) => (
        <polyline key={one.label || 'treated'} points={line(one.points)} fill="none" stroke={one.color}
                  strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      ))}

      <circle cx={x(60)} cy={y(baseline[baseline.length - 1].value)} r={3}
              fill="var(--color-ink-muted)" />
      {lines.map((one) => (
        <circle key={one.label || 'treated'} cx={x(60)} cy={y(one.points[one.points.length - 1].value)} r={3.4}
                fill={one.color} />
      ))}

      <title>{unit}</title>
    </svg>
  )
}
