import { useMemo, useState } from 'react'

import { AiSummaryPanel } from './AiSummaryPanel'
import { ClinicalStatusPanel } from './ClinicalStatusPanel'
import { DiagnosesCard } from './DiagnosesCard'
import { MedicationsCard } from './MedicationsCard'
import { TrendChart, type Series } from './TrendChart'
import { decimal } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { ObservationType } from '../../lib/database.types'
import type { TwinData } from '../../lib/twin'

const WINDOWS = [
  { days: 7, label: t.twin.chart.days7 },
  { days: 14, label: t.twin.chart.days14 },
  { days: 30, label: t.twin.chart.days30 },
]

const PLOTTED: { type: ObservationType; color: string; unit: string }[] = [
  { type: 'TEMPERATURE', color: 'var(--color-risk-critical)', unit: '°C' },
  { type: 'HEART_RATE', color: 'var(--color-phase-hospital)', unit: 'уд/мин' },
  { type: 'PAIN', color: 'var(--color-synthetic)', unit: '0–10' },
]

const ChartCard: React.FC<{ data: TwinData }> = ({ data }) => {
  const [days, setDays] = useState<number>(7)

  const series = useMemo<Series[]>(() => {
    const cutoff = Date.now() - days * 24 * 3600_000
    return PLOTTED.map((plot) => ({
      label: `${t.twin.vitals[plot.type]} (${plot.unit})`,
      color: plot.color,
      points: data.observations
        .filter(
          (observation) =>
            observation.type === plot.type &&
            observation.value_numeric !== null &&
            new Date(observation.recorded_at).getTime() >= cutoff,
        )
        .map((observation) => ({
          at: new Date(observation.recorded_at).getTime(),
          value: observation.value_numeric as number,
        }))
        .sort((a, b) => a.at - b.at),
    })).filter((one) => one.points.length > 1)
  }, [data.observations, days])

  const lead = series[0]
  const last = lead?.points[lead.points.length - 1]

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[1.0625rem] font-semibold">{t.twin.chart.title}</h3>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.8125rem]"
        >
          {WINDOWS.map((window) => (
            <option key={window.days} value={window.days}>{window.label}</option>
          ))}
        </select>
      </div>

      {series.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">{t.twin.chart.empty}</p>
      ) : (
        <>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((one) => (
              <span key={one.label} className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: one.color }} />
                {one.label}
              </span>
            ))}
          </div>

          <div className="mt-2">
            <TrendChart
              series={series}
              callout={last ? `${decimal(last.value)} °C` : undefined}
            />
          </div>
        </>
      )}
    </section>
  )
}

export const NowTab: React.FC<{ data: TwinData }> = ({ data }) => (
  <div className="space-y-4">
    <ClinicalStatusPanel data={data} />
    <AiSummaryPanel data={data} />

    <div className="grid gap-4 xl:grid-cols-3">
      <ChartCard data={data} />
      <DiagnosesCard data={data} />
      <MedicationsCard data={data} />
    </div>
  </div>
)
