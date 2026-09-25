import { StoryCard } from './StoryCard'
import { t } from '../../lib/i18n'

const LEVELS = [
  { label: t.story.risk.low, color: 'var(--color-spine-home)' },
  { label: t.story.risk.medium, color: 'var(--color-spine-alert)' },
  { label: t.story.risk.high, color: 'var(--color-risk-high)' },
]

export const RiskIndicator: React.FC = () => (
  <StoryCard label={t.story.risk.label}>
    <div className="flex items-center gap-2">
      {LEVELS.map((level, index) => (
        <span key={level.label} className="flex flex-1 items-center gap-2">
          {index > 0 && (
            <span aria-hidden className="text-[0.75rem] text-panel-muted/70">
              →
            </span>
          )}
          <span
            className="story-step flex-1 rounded-md px-2 py-1.5 text-center text-[0.75rem] font-medium"
            style={{
              animationDelay: `${200 + index * 520}ms`,
              ['--step-color' as string]: level.color,
            }}
          >
            {level.label}
          </span>
        </span>
      ))}
    </div>
    <p
      className="story-reveal mt-3 text-[0.75rem] text-panel-muted"
      style={{ animationDelay: '1500ms' }}
    >
      {t.story.risk.note}
    </p>
  </StoryCard>
)
