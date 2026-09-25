import type { CSSProperties } from 'react'

import { Sparkline } from './Sparkline'
import { SourceBadge } from './SourceBadge'
import { VitalIcon } from './vitalIcons'
import { decimal, relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { Observation, ObservationType } from '../../lib/database.types'
import { trendOf, type TwinData } from '../../lib/twin'
import './ClinicalStatusPanel.css'

interface Row {
  type: ObservationType
  unit?: string
  higherIsWorse: boolean
  color: string
  selfReported?: boolean
}

const ROWS: Row[] = [
  { type: 'TEMPERATURE', unit: '°C', higherIsWorse: true, color: 'var(--color-risk-critical)' },
  { type: 'HEART_RATE', unit: 'уд/мин', higherIsWorse: true, color: 'var(--color-risk-high)' },
  { type: 'BLOOD_PRESSURE', unit: 'мм рт.ст.', higherIsWorse: true, color: 'var(--color-phase-hospital)' },
  { type: 'SPO2', unit: '%', higherIsWorse: false, color: '#1f9b8e' },
  { type: 'PAIN', unit: '/10', higherIsWorse: true, color: 'var(--color-risk-critical)', selfReported: true },
  { type: 'RESPIRATORY_RATE', unit: 'в мин', higherIsWorse: true, color: 'var(--color-synthetic)' },
]

function value(observation: Observation): string {
  if (observation.type === 'BLOOD_PRESSURE') {
    return `${decimal(observation.value_numeric, 0)}/${decimal(observation.value_secondary, 0)}`
  }
  if (observation.value_boolean !== null) return observation.value_boolean ? 'да' : 'нет'
  if (observation.value_numeric !== null) return decimal(observation.value_numeric)
  return observation.value_text ?? t.common.dash
}

export const ClinicalStatusPanel: React.FC<{ data: TwinData }> = ({ data }) => {
  const rows = ROWS.map((row) => {
    const series = data.observations
      .filter((observation) => observation.type === row.type)
      .slice(0, 10)
    const [current, previous] = series
    const trend = trendOf(current, previous)
    const worsening =
      trend === 'up' || trend === 'down'
        ? row.higherIsWorse
          ? trend === 'up'
          : trend === 'down'
        : false

    const history = [...series]
      .reverse()
      .map((observation) => observation.value_numeric)
      .filter((number): number is number => number !== null)

    const progression = history.length > 1
      ? history.slice(-4).map((number) => decimal(number)).join(' → ')
      : null

    return { ...row, current, trend, worsening, history, progression }
  })

  const newest = data.observations[0]?.recorded_at ?? null

  return (
    <section className="clinical-status" aria-label={t.twin.clinicalStatus}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[1.0625rem] font-semibold">{t.twin.clinicalStatus}</h3>
        {newest && (
          <p className="text-[0.75rem] text-ink-muted">
            {t.twin.lastUpdate}: {relativeTime(newest)}
          </p>
        )}
      </div>

      <ul className="clinical-status__grid">
        {rows.map((row, index) => {
          const trendColor = row.trend === 'flat'
            ? 'var(--color-risk-low)'
            : row.worsening
              ? 'var(--color-risk-high)'
              : 'var(--color-risk-low)'
          const arrow = row.trend === 'up' ? '↑' : row.trend === 'down' ? '↓' : '→'
          const trendLabel = row.trend === 'flat'
            ? t.twin.trend.flat
            : row.worsening ? t.twin.trend.worse : t.twin.trend.better

          return (
            <li
              key={row.type}
              className="clinical-status__card"
              data-abnormal={row.current?.is_abnormal || undefined}
              data-empty={!row.current || undefined}
              style={{ '--vital-color': row.color, '--card-order': index } as CSSProperties}
            >
              <div className="clinical-status__card-heading">
                <span className="clinical-status__icon">
                  <VitalIcon kind={row.type} color={row.color} />
                </span>
                <h4 className="clinical-status__label">{t.twin.vitals[row.type]}</h4>
              </div>

              <p className="clinical-status__reading tabular">
                <span className="clinical-status__value">
                  {row.current ? value(row.current) : t.common.dash}
                </span>
                {row.unit && row.current && <span className="clinical-status__unit">{row.unit}</span>}
              </p>

              <div className="clinical-status__trend">
                {row.trend !== 'none' && (
                  <span className="clinical-status__trend-badge" style={{ color: trendColor }}>
                    <span aria-hidden>{arrow}</span> {trendLabel}
                  </span>
                )}
                {row.selfReported && row.current?.source === 'PATIENT' && (
                  <span className="clinical-status__self-reported">{t.twin.selfReported}</span>
                )}
              </div>

              <div className="clinical-status__history">
                {row.history.length > 1 ? (
                  <>
                    <Sparkline
                      values={row.history}
                      color={row.worsening ? 'var(--color-risk-high)' : row.color}
                      height={32}
                      width={140}
                    />
                    <p className="clinical-status__progression tabular">{row.progression}</p>
                  </>
                ) : (
                  <span className="clinical-status__empty-history">
                    {row.current ? t.twin.chart.empty : t.twin.noData}
                  </span>
                )}
              </div>

              {row.current && (
                <div className="clinical-status__footer">
                  <SourceBadge source={row.current.source} />
                  <time dateTime={row.current.recorded_at}>
                    {relativeTime(row.current.recorded_at)}
                  </time>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
