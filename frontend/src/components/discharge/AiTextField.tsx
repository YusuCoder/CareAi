import { useRef } from 'react'

import { t } from '../../lib/i18n'
import { aiFieldStatus, type AiFieldState } from '../../lib/dischargeReview'
import { AiBadge, GhostButton, INPUT, ReviewBadge, Sparkle } from './ui'

/**
 * Поле с AI-черновиком. Текст AI никогда не выглядит утверждённым: пока врач
 * не отметил его проверенным или не правил, рядом висит «Требует проверки».
 * Правка врача видна как «Изменено врачом».
 */
export const AiTextField: React.FC<{
  id: string
  label: string
  rows: number
  value: string
  onChange: (value: string) => void
  ai: AiFieldState | undefined
  onReviewed: () => void
  onRegenerate: () => void
  regenerating: boolean
  sources?: string[]
}> = ({ id, label, rows, value, onChange, ai, onReviewed, onRegenerate, regenerating, sources }) => {
  const f = t.dischargeFlow
  const ref = useRef<HTMLTextAreaElement>(null)
  const status = aiFieldStatus(value, ai)

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-[0.8125rem] font-medium">{label}</label>
        {status !== 'manual' && <AiBadge />}
        {status !== 'manual' && <ReviewBadge kind={status} />}
        <span className="ml-auto flex items-center gap-1">
          <GhostButton tone="primary" onClick={onRegenerate} disabled={regenerating}>
            <span className="inline-flex items-center gap-1">
              <Sparkle size={12} /> {f.regenerate}
            </span>
          </GhostButton>
          <GhostButton onClick={() => ref.current?.focus()}>{f.edit}</GhostButton>
        </span>
      </div>

      <textarea
        ref={ref}
        id={id}
        rows={rows}
        className={`${INPUT} leading-relaxed ${
          status === 'needsReview' ? 'border-dashed border-primary/40 bg-primary-soft/30' : ''
        }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={status !== 'manual' ? `${id}-ai` : undefined}
      />

      {status !== 'manual' && (
        <div id={`${id}-ai`} className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {sources && sources.length > 0 && (
            <p className="text-[0.6875rem] text-ink-muted">
              {f.aiUsed}: {sources.join(' · ')}
            </p>
          )}
          {status === 'needsReview' && (
            <button
              type="button"
              onClick={onReviewed}
              className="ml-auto rounded-md border border-border px-2.5 py-1 text-[0.75rem] transition-colors hover:border-risk-low hover:text-risk-low"
            >
              ✓ {f.confirmText}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
