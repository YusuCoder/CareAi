import { StoryCard, StoryCheck } from './StoryCard'
import { t } from '../../lib/i18n'

const ROWS = [
  { label: t.story.alert.temperature, value: '38,2 °C' },
  { label: t.story.alert.heartRate, value: '108 уд/мин' },
  { label: t.story.alert.pain, value: t.story.alert.painValue },
]

export const ClinicalAlert: React.FC = () => (
  <StoryCard label={t.story.alert.label} tone="warning">
    <dl className="space-y-1.5">
      {ROWS.map((row, index) => (
        <div
          key={row.label}
          className="story-reveal flex items-baseline justify-between gap-3"
          style={{ animationDelay: `${index * 150}ms` }}
        >
          <dt className="text-[0.8125rem] text-panel-muted">{row.label}</dt>
          <dd className="tabular text-[0.875rem] font-medium text-panel-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
    <div className="mt-3.5 border-t border-white/10 pt-3">
      <StoryCheck delay={700}>{t.story.alert.notified}</StoryCheck>
    </div>
  </StoryCard>
)
