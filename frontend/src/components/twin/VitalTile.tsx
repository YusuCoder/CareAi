import { SourceBadge } from './SourceBadge'
import { decimal, relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { Observation, ObservationType } from '../../lib/database.types'
import { trendOf, type Trend } from '../../lib/twin'

interface Props {
  type: ObservationType
  unit?: string
  higherIsWorse: boolean
  current?: Observation
  previous?: Observation
}

function render(observation: Observation): string {
  if (observation.type === 'BLOOD_PRESSURE') {
    return `${decimal(observation.value_numeric, 0)}/${decimal(observation.value_secondary, 0)}`
  }
  if (observation.value_boolean !== null) return observation.value_boolean ? 'да' : 'нет'
  if (observation.value_numeric !== null) return decimal(observation.value_numeric)
  return observation.value_text ?? t.common.dash
}

export const VitalTile: React.FC<Props> = ({ type, unit, higherIsWorse, current, previous }) => {
  const trend: Trend = trendOf(current, previous)
  const worsening =
    trend !== 'none' && trend !== 'flat' && (higherIsWorse ? trend === 'up' : trend === 'down')

  const label =
    trend === 'flat'
      ? t.twin.trend.flat
      : worsening
        ? t.twin.trend.worse
        : t.twin.trend.better

  return (
    <div className="rounded-lg border border-border p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[0.8125rem] text-ink-muted">{t.twin.vitals[type] ?? type}</p>
        {current && <SourceBadge source={current.source} />}
      </div>

      <p className="tabular mt-1.5 flex items-baseline gap-1">
        <span
          className="text-[1.375rem] font-semibold leading-none"
          style={current?.is_abnormal ? { color: 'var(--color-risk-high)' } : undefined}
        >
          {current ? render(current) : t.common.dash}
        </span>
        {unit && current && <span className="text-xs text-ink-muted">{unit}</span>}
      </p>

      <p className="mt-2 flex items-center gap-1.5 text-[0.75rem]">
        {trend !== 'none' && (
          <span
            aria-hidden
            style={{
              color: trend === 'flat'
                ? 'var(--color-ink-muted)'
                : worsening
                  ? 'var(--color-risk-high)'
                  : 'var(--color-risk-low)',
            }}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
        <span className="text-ink-muted">
          {trend === 'none' ? (current ? relativeTime(current.recorded_at) : '') : label}
        </span>
        {trend !== 'none' && current && (
          <span className="ml-auto truncate text-ink-muted/70">
            {relativeTime(current.recorded_at)}
          </span>
        )}
      </p>
    </div>
  )
}
