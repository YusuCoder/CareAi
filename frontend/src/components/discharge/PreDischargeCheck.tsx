import { t } from '../../lib/i18n'
import type { Check } from '../../lib/dischargeReview'
import { Sparkle } from './ui'

/** Пункты считаются из формы (reviewDischarge), здесь только отображение. */
export const PreDischargeCheck: React.FC<{ checks: Check[] }> = ({ checks }) => {
  const f = t.dischargeFlow
  const counted = checks.filter((check) => !check.neutral)
  const ready = counted.filter((check) => check.ok).length

  return (
    <section className="ai-card rounded-2xl p-5" aria-labelledby="pre-discharge-check">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id="pre-discharge-check"
          className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-primary"
        >
          <Sparkle size={14} /> {f.checkTitle}
        </h2>
        <p className="ml-auto text-[0.8125rem]">
          <span className="tabular text-base font-semibold">{ready} / {counted.length}</span>{' '}
          <span className="text-ink-muted">{f.ready}</span>
        </p>
      </div>

      <ul className="mt-3 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 text-[0.8125rem] leading-snug">
            <span
              aria-hidden
              className={`mt-px shrink-0 ${check.ok ? 'check-pop' : ''}`}
              style={{
                color: check.neutral
                  ? 'var(--color-ink-muted)'
                  : check.ok
                    ? 'var(--color-risk-low)'
                    : check.blocking
                      ? 'var(--color-risk-critical)'
                      : 'var(--color-risk-medium)',
              }}
            >
              {check.neutral ? '○' : check.ok ? '✓' : '⚠'}
            </span>
            <span className={check.neutral ? 'text-ink-muted' : ''}>{check.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
