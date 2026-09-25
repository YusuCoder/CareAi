import { StoryCard, StoryCheck } from './StoryCard'
import { t } from '../../lib/i18n'

export const CareHandoffCard: React.FC = () => (
  <StoryCard label={t.story.handoff.label}>
    <div className="story-reveal">
      <p className="text-[0.9375rem] font-medium text-panel-ink">{t.story.handoff.organization}</p>
      <p className="mt-0.5 text-[0.8125rem] text-panel-muted">{t.story.handoff.nurse}</p>
    </div>

    <div
      className="story-reveal mt-3.5 flex items-center gap-2 text-[0.75rem] text-panel-muted"
      style={{ animationDelay: '160ms' }}
    >
      <span className="truncate">{t.story.handoff.from}</span>
      <span aria-hidden className="text-panel-ink">↓</span>
      <span className="truncate text-panel-ink">{t.story.handoff.to}</span>
    </div>

    <div className="mt-3.5 space-y-2">
      <StoryCheck delay={320}>{t.story.handoff.received}</StoryCheck>
      <StoryCheck delay={460}>{t.story.handoff.twinAccess}</StoryCheck>
    </div>

    <p
      className="story-reveal mt-3.5 border-t border-white/10 pt-3 text-[0.75rem] leading-snug text-panel-muted"
      style={{ animationDelay: '620ms' }}
    >
      {t.story.handoff.note}
    </p>
  </StoryCard>
)
