import { useAuth } from '../../contexts/AuthContext'
import { useShiftSummary } from '../../lib/ai'
import { seesTelegramFeed } from '../../lib/telegram'
import { relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { TwinData } from '../../lib/twin'

const Sparkle = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
    <path d="M12 2.5l1.7 4.6 4.6 1.7-4.6 1.7L12 15.1l-1.7-4.6-4.6-1.7 4.6-1.7z" />
    <path d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" opacity=".6" />
  </svg>
)

export const AiSummaryPanel: React.FC<{ data: TwinData }> = ({ data }) => {
  const { role } = useAuth()
  const { data: summary, loading, error, refresh } = useShiftSummary(data.patient?.id, seesTelegramFeed(role))

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-primary">
          <Sparkle />
        </span>
        <h3 className="text-[1.0625rem] font-semibold">{t.twin.aiSummary}</h3>
        {summary && (
          <p className="ml-auto text-xs text-ink-muted">
            {t.ai.generated} {relativeTime(summary.generated_at)}
          </p>
        )}
      </div>

      {loading && <p className="mt-3 text-sm text-ink-muted">{t.ai.generating}</p>}

      {!loading && error && (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">{t.ai.notConfigured}</p>
          <p className="mt-1 text-xs text-ink-muted/70">{error}</p>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <p
            className="mt-3 rounded-lg px-3 py-2.5 text-[0.8125rem] leading-relaxed"
            style={{
              color: 'var(--color-risk-critical)',
              backgroundColor: 'color-mix(in oklab, var(--color-risk-critical) 8%, transparent)',
            }}
          >
            {summary.summary}
          </p>

          {summary.findings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {summary.findings.map((finding) => (
                <li key={finding} className="flex gap-2 text-[0.8125rem] leading-snug">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-muted" />
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-border pt-2.5">
            <button
              type="button"
              onClick={refresh}
              className="rounded-md bg-primary-soft px-3 py-1.5 text-[0.8125rem] font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {t.ai.refresh}
            </button>
            <p className="text-[0.6875rem] leading-snug text-ink-muted">
              {t.ai.sources} {summary.event_count}. {t.ai.grounding}
            </p>
          </div>
        </>
      )}
    </section>
  )
}
