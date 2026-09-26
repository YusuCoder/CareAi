import { useState } from 'react'

import { ProjectionChart, type Series } from './ProjectionChart'
import type { CandidateResult, DrugCompareResult, DrugVerdict, FindingLevel } from '../../lib/drugCheck'
import { decimal } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { Marker, Point } from '../../lib/simulation'
import { tint } from '../../lib/visits'

/** Цвет закреплён за местом в рейтинге: первый вариант всегда основной. */
const COLORS = ['var(--color-primary)', '#1f9b8e', 'var(--color-risk-medium)', 'var(--color-synthetic)']

const VERDICT_COLOR: Record<DrugVerdict, string> = {
  BLOCK: 'var(--color-risk-critical)',
  CAUTION: 'var(--color-risk-medium)',
  NO_FINDINGS: 'var(--color-risk-low)',
  UNKNOWN: 'var(--color-ink-muted)',
}

const LEVEL_COLOR: Record<FindingLevel, string> = {
  BLOCK: 'var(--color-risk-critical)',
  WARN: 'var(--color-risk-medium)',
  INFO: 'var(--color-ink-muted)',
}

const Row: React.FC<{ item: CandidateResult; color: string; best: boolean }> = ({ item, color, best }) => {
  const [open, setOpen] = useState(false)
  const c = t.forecast.compare
  const blocked = item.verdict === 'BLOCK' || item.verdict === 'UNKNOWN' || item.error !== null
  const verdictColor = item.error ? VERDICT_COLOR.UNKNOWN : VERDICT_COLOR[item.verdict]
  const lead = item.findings.find((finding) => finding.level !== 'INFO')

  return (
    <li
      className="rounded-lg border"
      style={{
        borderColor: best ? tint('var(--color-risk-low)', 55) : 'var(--color-border)',
        backgroundColor: best ? tint('var(--color-risk-low)', 5) : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`grid w-full gap-x-4 gap-y-1 px-3.5 py-3 text-left sm:grid-cols-[1.75rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] ${blocked ? 'opacity-70' : ''}`}
      >
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: item.forecast && !blocked ? color : 'var(--color-border-strong)' }} aria-hidden />
          <span className="tabular text-[0.8125rem] font-semibold text-ink-muted">{item.rank}</span>
        </span>

        <span className="min-w-0">
          <span className="block text-[0.875rem] font-semibold">
            {item.drug.inn}
            {best && (
              <span className="ml-2 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium" style={{ color: 'var(--color-risk-low)', backgroundColor: tint('var(--color-risk-low)', 12) }}>
                {c.bestBadge}
              </span>
            )}
          </span>
          <span className="block text-[0.75rem] text-ink-muted">
            {item.drug.class_label || c.unknownClass}
            {item.same_class_as.length > 0 && ` · ${c.sameClass} ${item.same_class_as.join(', ')}`}
          </span>
        </span>

        <span className="text-[0.8125rem]">
          <span className="font-medium" style={{ color: verdictColor }}>
            {item.error ? c.failed : t.forecast.compare.verdicts[item.verdict]}
          </span>
          {lead && <span className="block text-[0.75rem] leading-snug text-ink-muted">{lead.text}</span>}
        </span>

        <span className="tabular text-[0.8125rem] sm:text-right">
          {item.forecast ? (
            <>
              <span className="font-semibold">{decimal(item.forecast.risk.treated)}%</span>
              <span className="block text-[0.75rem]" style={{ color: 'var(--color-risk-low)' }}>
                −{decimal(item.forecast.risk.absoluteReduction)} {c.points}
              </span>
            </>
          ) : (
            <span className="text-[0.75rem] text-ink-muted">
              {item.forecast_reason === 'NOT_MODELED' ? c.notModeled
                : item.forecast_reason === 'MISSING_DATA' ? c.missingData : '—'}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-3.5 py-3">
          {item.summary && <p className="text-[0.8125rem] leading-relaxed">{item.summary}</p>}
          {item.findings.length === 0 && !item.error && (
            <p className="text-[0.8125rem] text-ink-muted">{t.forecast.ai.noFindings}</p>
          )}
          <ul className="space-y-1.5">
            {item.findings.map((finding, index) => (
              <li key={index} className="rounded-md px-2.5 py-1.5" style={{ backgroundColor: tint(LEVEL_COLOR[finding.level]) }}>
                <p className="text-[0.8125rem]">
                  <span className="font-semibold" style={{ color: LEVEL_COLOR[finding.level] }}>
                    {t.forecast.ai.levels[finding.level]}
                  </span>{' '}
                  · {finding.text}
                </p>
                {finding.evidence.length > 0 && (
                  <p className="mt-0.5 text-[0.6875rem] text-ink-muted">
                    {finding.evidence.map((source) => `${source.id}: ${source.text}`).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {item.monitoring.length > 0 && (
            <p className="text-[0.75rem] text-ink-muted">
              {t.forecast.ai.monitoring}: {item.monitoring.join('; ')}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

export const ComparePanel: React.FC<{ data: DrugCompareResult; loading: boolean }> = ({ data, loading }) => {
  const c = t.forecast.compare
  const best = data.results.find((item) => item.drug.query === data.best) ?? null

  // На графики — только допустимые варианты с рассчитанным прогнозом.
  const charted = data.results.filter((item) =>
    item.forecast && !item.error && item.verdict !== 'BLOCK' && item.verdict !== 'UNKNOWN')
  const colorOf = (item: CandidateResult) => COLORS[charted.indexOf(item) % COLORS.length]

  const markers = new Map<Marker, { unit: string; baseline: Point[]; series: Series[] }>()
  for (const item of charted) {
    for (const trajectory of item.forecast!.trajectories) {
      const entry = markers.get(trajectory.marker) ??
        { unit: trajectory.unit, baseline: trajectory.baseline, series: [] }
      entry.series.push({ label: item.drug.inn, color: colorOf(item), points: trajectory.treated })
      markers.set(trajectory.marker, entry)
    }
  }

  const allBlocked = data.results.every((item) => item.verdict === 'BLOCK' || item.verdict === 'UNKNOWN' || item.error)

  return (
    <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
      <section
        className="rounded-xl border p-4"
        style={{
          borderColor: tint(best ? 'var(--color-risk-low)' : 'var(--color-risk-medium)', 45),
          backgroundColor: tint(best ? 'var(--color-risk-low)' : 'var(--color-risk-medium)', 6),
        }}
      >
        <p className="text-[0.75rem] text-ink-muted">{c.title} · {data.results.length} {c.candidates}</p>
        {best && best.forecast ? (
          <>
            <p className="mt-0.5 font-semibold" style={{ color: 'var(--color-risk-low)' }}>
              {c.best}: {best.drug.inn}
            </p>
            <p className="mt-1 text-[0.8125rem]">
              {c.riskFrom} {decimal(best.forecast.risk.baseline)}% {c.riskTo} {decimal(best.forecast.risk.treated)}%
              {' '}(−{decimal(best.forecast.risk.absoluteReduction)} {c.points})
              {best.verdict === 'CAUTION' && <span style={{ color: 'var(--color-risk-medium)' }}> · {c.withCaution}</span>}
            </p>
          </>
        ) : (
          <p className="mt-0.5 font-semibold" style={{ color: 'var(--color-risk-medium)' }}>
            {allBlocked ? c.allBlocked : c.noForecast}
          </p>
        )}
        <p className="mt-2 text-[0.6875rem] text-ink-muted">{c.rule}</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="hidden gap-x-4 px-3.5 pb-1.5 text-[0.6875rem] uppercase tracking-wide text-ink-muted sm:grid sm:grid-cols-[1.75rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <span>#</span>
          <span>{c.drug}</span>
          <span>{c.check}</span>
          <span className="text-right">
            {c.risk}{data.baseline_risk !== null && ` (${c.without} ${decimal(data.baseline_risk)}%)`}
          </span>
        </div>
        <ul className="space-y-2">
          {data.results.map((item) => (
            <Row key={item.drug.query} item={item} color={colorOf(item)} best={item === best} />
          ))}
        </ul>
        <p className="mt-2 text-[0.6875rem] text-ink-muted">{c.expand}</p>
      </section>

      {[...markers.entries()].map(([marker, entry]) => (
        <section key={marker} className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-[0.9375rem] font-semibold">
            {t.forecast.trajectory}: {t.forecast.markers[marker]}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-dashed border-ink-muted" />
              {t.forecast.baseline}
            </span>
            {entry.series.map((one) => (
              <span key={one.label} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0 w-5 border-t-2" style={{ borderColor: one.color }} />
                {one.label}
              </span>
            ))}
          </div>
          <div className="mt-1.5">
            <ProjectionChart baseline={entry.baseline} series={entry.series} unit={entry.unit} />
          </div>
        </section>
      ))}

      <p className="text-[0.75rem] leading-relaxed text-ink-muted">
        {t.forecast.ai.used}: {data.used.records} · {data.model}. {data.disclaimer}
      </p>
    </div>
  )
}
