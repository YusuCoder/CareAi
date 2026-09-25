import { StoryCard, StoryCheck } from './StoryCard'
import { t } from '../../lib/i18n'

export const PatientCheckIn: React.FC = () => (
  <StoryCard label={t.brand}>
    <p className="story-reveal text-[0.875rem] text-panel-ink">{t.story.checkIn.greeting}</p>
    <p
      className="story-reveal mt-1 text-[0.875rem] text-panel-muted"
      style={{ animationDelay: '140ms' }}
    >
      {t.story.checkIn.question}
    </p>

    <div className="story-reveal mt-3.5 flex justify-end" style={{ animationDelay: '900ms' }}>
      <span className="tabular rounded-lg rounded-br-sm bg-white/18 px-3 py-1.5 text-[0.9375rem] font-medium text-white">
        {t.story.checkIn.answer}
      </span>
    </div>

    <div className="mt-3.5 border-t border-white/10 pt-3">
      <StoryCheck delay={1400}>{t.story.checkIn.confirmed}</StoryCheck>
    </div>
  </StoryCard>
)
