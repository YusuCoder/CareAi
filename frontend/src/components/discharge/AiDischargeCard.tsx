import { useEffect, useState } from 'react'

import { relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { AiStatus } from '../../lib/dischargeAi'
import type { ForecastGap } from '../../lib/dischargeReview'
import { Sparkle } from './ui'

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Шаги показывают, какие части карты уходят в запрос. Последний шаг остаётся
 * «в работе», пока функция действительно не ответила: время раскрытия шагов
 * — только подача, готовность определяет ответ сервера.
 */
const AiProcessingStatus: React.FC = () => {
  const f = t.dischargeFlow
  const steps = [f.stepHistory, f.stepHospitalization, f.stepDiagnoses, f.stepLabs, f.stepMeds]
  const [shown, setShown] = useState<number>(() => (reducedMotion() ? steps.length : 0))

  useEffect(() => {
    if (shown >= steps.length) return
    const timer = window.setTimeout(() => setShown((value) => value + 1), 420)
    return () => window.clearTimeout(timer)
  }, [shown, steps.length])

  return (
    <div role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
        <span className="ai-pulse text-primary"><Sparkle /></span>
        {f.analysing}
      </p>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {steps.slice(0, shown).map((step) => (
          <li key={step} className="ai-step-in flex items-center gap-2 text-[0.8125rem]">
            <span className="check-pop text-risk-low">✓</span>
            {step}
          </li>
        ))}
        {shown >= steps.length && (
          <li className="ai-step-in flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <span className="ai-pulse">○</span>
            {f.stepPlan}…
          </li>
        )}
      </ul>
    </div>
  )
}

export interface AnalysedCounts {
  diagnoses: number
  procedures: number
  medications: number
  observations: number
  labs: number
  prior_hospitalizations: number | null
}

const Completeness: React.FC<{
  gaps: ForecastGap[]
  open: ForecastGap[]
  onFill: (gap: ForecastGap) => void
}> = ({ gaps, open, onFill }) => {
  const f = t.dischargeFlow
  const fillable = open.filter((gap) => gap.field)
  const profileOnly = open.filter((gap) => !gap.field)
  // gaps — пробелы в карте на момент открытия; «зелёный» переход показываем,
  // только если они были и врач закрыл их в форме
  const hadGaps = gaps.length > 0

  if (fillable.length === 0 && profileOnly.length === 0) {
    return (
      <p
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] ${hadGaps ? 'resolve-in' : ''}`}
        style={{
          color: 'var(--color-risk-low)',
          backgroundColor: 'color-mix(in oklab, var(--color-risk-low) 9%, transparent)',
        }}
      >
        <span className="check-pop">✓</span>
        {f.forecastEnough}
      </p>
    )
  }

  return (
    <div
      className="rounded-lg px-3 py-2 text-[0.8125rem]"
      style={{ backgroundColor: 'color-mix(in oklab, var(--color-risk-medium) 8%, transparent)' }}
    >
      {fillable.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span style={{ color: 'var(--color-risk-medium)' }}>
            ⚠ {f.forecastMissing} {fillable.length}:
          </span>
          {fillable.map((gap) => (
            <button
              key={gap.gap}
              type="button"
              onClick={() => onFill(gap)}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-medium text-ink shadow-[0_0_0_1px_var(--color-border)] transition-colors hover:text-primary"
            >
              {gap.label} <span className="text-primary">{f.fill} →</span>
            </button>
          ))}
        </div>
      )}
      {profileOnly.length > 0 && (
        <p className="mt-1 text-[0.75rem] text-ink-muted">
          {profileOnly.map((gap) => gap.label).join(', ')} — {f.inProfile}
        </p>
      )}
    </div>
  )
}

export const AiDischargeCard: React.FC<{
  status: AiStatus
  generatedAt: string | null
  counts: AnalysedCounts
  reviewFlags: string[]
  sectionsReady: number
  sectionsTotal: number
  gaps: ForecastGap[]
  openGaps: ForecastGap[]
  onGenerate: () => void
  onFill: (gap: ForecastGap) => void
}> = ({
  status, generatedAt, counts, reviewFlags, sectionsReady, sectionsTotal,
  gaps, openGaps, onGenerate, onFill,
}) => {
  const f = t.dischargeFlow
  const analysed: [string, number | null][] = [
    [f.usedHospitalization, null],
    [f.usedDiagnoses, counts.diagnoses],
    [f.usedObservations, counts.observations],
    [f.usedLabs, counts.labs],
    [f.usedMeds, counts.medications],
    [f.usedHistory, counts.prior_hospitalizations],
  ]
  const progress = sectionsTotal ? sectionsReady / sectionsTotal : 0

  return (
    <section className="ai-card rounded-2xl p-5" aria-label={f.brand}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-primary">
          <Sparkle size={14} /> {f.brand}
        </span>
        {status === 'ready' && generatedAt && (
          <span className="text-[0.75rem] text-ink-muted">· {relativeTime(generatedAt)}</span>
        )}
        {status === 'ready' && (
          <button
            type="button"
            onClick={onGenerate}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] text-primary transition-colors hover:bg-primary-soft"
          >
            <Sparkle size={12} /> {f.regenerate}
          </button>
        )}
      </div>

      <div className="mt-3">
        {status === 'loading' && <AiProcessingStatus />}

        {status === 'ready' && (
          <div className="handoff-in">
            <h2 className="text-lg font-semibold tracking-tight">{f.draftReadyFinal}</h2>
            <p className="mt-2 text-[0.75rem] text-ink-muted">{f.analysed}:</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {analysed.map(([label, n]) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[0.75rem]"
                >
                  <span className="text-risk-low">✓</span>
                  {label}
                  {n !== null && <span className="tabular text-ink-muted">{n}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === 'error' && (
          <div role="alert">
            <p className="text-[0.9375rem] font-medium">{f.aiFailed}</p>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">{f.aiFailedBody}</p>
            <button
              type="button"
              onClick={onGenerate}
              className="mt-3 rounded-md bg-primary-soft px-3 py-1.5 text-[0.8125rem] font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {f.retry}
            </button>
          </div>
        )}

        {status === 'idle' && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[0.8125rem] text-ink-muted">{f.aiIdle}</p>
            <button
              type="button"
              onClick={onGenerate}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover"
            >
              <Sparkle size={13} /> {f.aiStart}
            </button>
          </div>
        )}
      </div>

      {status === 'ready' && reviewFlags.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="text-[0.75rem] font-medium text-ink-muted">{f.reviewFlags}:</p>
          <ul className="mt-1 space-y-1">
            {reviewFlags.map((flag) => (
              <li key={flag} className="flex gap-2 text-[0.8125rem] leading-snug">
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-[minmax(0,16rem)_1fr] lg:items-center">
        <div>
          <p className="text-[0.8125rem]">
            <span className="tabular text-base font-semibold">{sectionsReady}</span>
            <span className="text-ink-muted"> {f.of} {sectionsTotal} {f.sectionsReady}</span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
        <Completeness gaps={gaps} open={openGaps} onFill={onFill} />
      </div>

      <p className="mt-3 text-[0.6875rem] text-ink-muted">{f.aiDisclaimer}</p>
    </section>
  )
}
