import { useShiftSummary } from '../../lib/ai'
import { relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'

export const ShiftSummary: React.FC<{ includeTelegram: boolean }> = ({ includeTelegram }) => {
  const { data, loading, error, refresh } = useShiftSummary(undefined, includeTelegram)

  return (
    <section className="rounded-xl border border-primary/20 bg-primary-soft/50 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-primary">{t.ai.title}</h2>

        {data && (
          <p className="text-xs text-ink-muted">
            {t.ai.generated} {relativeTime(data.generated_at)}
          </p>
        )}

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="ml-auto rounded-md border border-primary/25 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {t.ai.refresh}
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-ink-muted">{t.ai.generating}</p>}

      {!loading && error && (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">{t.ai.notConfigured}</p>
          <p className="mt-1 text-xs text-ink-muted/70">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed">{data.summary}</p>
          <p className="mt-3 border-t border-primary/15 pt-2.5 text-xs text-ink-muted">
            {t.ai.sources} {data.event_count}. {t.ai.grounding}
          </p>
        </>
      )}
    </section>
  )
}
