import { plural, t } from '../../lib/i18n'
import type { SectionStatus } from '../../lib/dischargeReview'

export const INPUT =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.8125rem] outline-none transition-colors focus-visible:border-primary'

export const Sparkle: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
    <path d="M12 2.5l1.7 4.6 4.6 1.7-4.6 1.7L12 15.1l-1.7-4.6-4.6-1.7 4.6-1.7z" />
    <path d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" opacity=".6" />
  </svg>
)

const tone: Record<SectionStatus, string> = {
  done: 'var(--color-risk-low)',
  attention: 'var(--color-risk-medium)',
  empty: 'var(--color-ink-muted)',
}

/** ✓ / ⚠ / ○ — один знак, чтобы статус читался без цвета. */
export const StatusMark: React.FC<{ status: SectionStatus; size?: number }> = ({ status, size = 18 }) => (
  <span
    aria-hidden
    className={`inline-flex shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold leading-none ${
      status === 'done' ? 'check-pop' : ''
    }`}
    style={{
      width: size,
      height: size,
      color: status === 'done' ? 'white' : tone[status],
      backgroundColor:
        status === 'done'
          ? tone.done
          : status === 'attention'
            ? `color-mix(in oklab, ${tone.attention} 16%, transparent)`
            : 'transparent',
      border: status === 'empty' ? `1.5px solid ${tone.empty}` : undefined,
    }}
  >
    {status === 'done' ? '✓' : status === 'attention' ? '!' : ''}
  </span>
)

export const CompletionIndicator: React.FC<{ status: SectionStatus; issues: number }> = ({
  status, issues,
}) => {
  const f = t.dischargeFlow
  const label =
    status === 'done' ? f.statusDone : status === 'attention' ? f.statusAttention : f.statusEmpty
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.75rem]" style={{ color: tone[status] }}>
      <StatusMark status={status} size={16} />
      <span>{label}</span>
      {status === 'attention' && issues > 0 && (
        <span className="tabular text-ink-muted">
          · {issues} {plural(issues, f.fieldsCount)}
        </span>
      )}
    </span>
  )
}

/** Пометка AI-контента: всегда видна, пока текст не подтверждён врачом. */
export const AiBadge: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
    <Sparkle size={11} />
    {children ?? t.dischargeFlow.aiPrepared}
  </span>
)

export const ReviewBadge: React.FC<{ kind: 'needsReview' | 'edited' | 'reviewed' }> = ({ kind }) => {
  const f = t.dischargeFlow
  const color =
    kind === 'needsReview' ? 'var(--color-risk-medium)'
      : kind === 'reviewed' ? 'var(--color-risk-low)'
        : 'var(--color-ink-muted)'
  const label =
    kind === 'needsReview' ? f.needsReview : kind === 'reviewed' ? f.reviewedByDoctor : f.editedByDoctor
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem]"
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
    >
      {kind === 'reviewed' ? '✓' : kind === 'needsReview' ? '●' : '✎'} {label}
    </span>
  )
}

/** Откуда значение: из карты (с датой) или введено врачом сейчас. */
export const Provenance: React.FC<{
  kind: 'twin' | 'doctor' | 'history' | 'none'
  label: string
  when?: string
}> = ({ kind, label, when }) => {
  const color =
    kind === 'twin' ? 'var(--color-primary)'
      : kind === 'doctor' ? 'var(--color-phase-home)'
        : kind === 'history' ? 'var(--color-brand-deep)'
          : 'var(--color-border-strong)'
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] leading-tight text-ink-muted">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
      {when && <span className="tabular">· {when}</span>}
    </span>
  )
}

export const GhostButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'danger' | 'muted' }
> = ({ tone = 'muted', className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`rounded-md px-2 py-1 text-[0.75rem] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      tone === 'primary'
        ? 'text-primary hover:bg-primary-soft'
        : tone === 'danger'
          ? 'text-ink-muted hover:bg-surface-sunken hover:text-risk-critical'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
    } ${className}`}
  />
)

export const AddButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({
  onClick, children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-ink-muted transition-colors hover:border-primary hover:text-primary"
  >
    + {children}
  </button>
)

export const FieldLabel: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({
  children, htmlFor,
}) => (
  <label htmlFor={htmlFor} className="mb-1 block text-[0.75rem] text-ink-muted">
    {children}
  </label>
)
