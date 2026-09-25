import type { ReactNode } from 'react'

interface Props {
  label?: string
  children: ReactNode
  tone?: 'default' | 'warning'
}

export const StoryCard: React.FC<Props> = ({ label, children, tone = 'default' }) => (
  <div
    className={[
      'rounded-xl border p-4 backdrop-blur-sm',
      tone === 'warning'
        ? 'border-[color:var(--color-spine-alert)]/35 bg-[color:var(--color-spine-alert)]/10'
        : 'border-white/12 bg-white/8',
    ].join(' ')}
  >
    {label && (
      <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-panel-muted">
        {label}
      </p>
    )}
    {children}
  </div>
)

export const StoryCheck: React.FC<{ children: ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => (
  <p
    className="story-reveal flex items-center gap-2 text-[0.8125rem] text-panel-ink"
    style={{ animationDelay: `${delay}ms` }}
  >
    <span
      aria-hidden
      className="inline-block size-[1.125rem] shrink-0 rounded-full text-center text-[0.75rem] leading-[1.125rem]"
      style={{ background: 'var(--color-spine-home)', color: 'var(--color-brand-deep)' }}
    >
      ✓
    </span>
    {children}
  </p>
)
