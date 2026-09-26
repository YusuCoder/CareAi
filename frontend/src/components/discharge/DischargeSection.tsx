import type { SectionReview } from '../../lib/dischargeReview'
import { CompletionIndicator, StatusMark } from './ui'

/**
 * Раздел проверки выписки. Готовый раздел можно свернуть до одной строки со
 * сводкой — страница становится короче, а содержимое формы не размонтируется
 * (свёрнутое остаётся в DOM, поэтому состояние полей не теряется).
 */
export const DischargeSection: React.FC<{
  id: string
  index: number
  title: string
  review: SectionReview
  open: boolean
  onToggle: () => void
  summary?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
}> = ({ id, index, title, review, open, onToggle, summary, aside, children }) => (
  <section
    id={`section-${id}`}
    className="scroll-mt-4 rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(26_23_51/0.04)]"
  >
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`section-body-${id}`}
        className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-0.5 text-left focus-visible:outline-2 focus-visible:outline-primary"
      >
        <StatusMark status={review.status} />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">
            <span className="tabular text-ink-muted">{index}.</span> {title}
          </span>
          {!open && summary && (
            <span className="mt-0.5 block truncate text-[0.75rem] text-ink-muted">{summary}</span>
          )}
          {!open && review.status === 'attention' && review.issues.length > 0 && (
            <span className="mt-0.5 block truncate text-[0.75rem]" style={{ color: 'var(--color-risk-medium)' }}>
              {review.issues.join(' · ')}
            </span>
          )}
        </span>
        <CompletionIndicator status={review.status} issues={review.issues.length} />
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {aside}
    </div>

    <div id={`section-body-${id}`} className="ct-collapse" data-open={open ? '' : undefined}>
      <div inert={!open}>
        <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
      </div>
    </div>
  </section>
)
