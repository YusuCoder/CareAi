import type { ReactNode } from 'react'

import { CareHandoffCard } from './CareHandoffCard'
import { ClinicalAlert } from './ClinicalAlert'
import { MonitoringCard } from './MonitoringCard'
import { PatientCheckIn } from './PatientCheckIn'
import { RiskIndicator } from './RiskIndicator'
import { StoryCheck } from './StoryCard'
import { StoryTimeline } from './StoryTimeline'
import type { StoryStage } from './storySequence'
import { t } from '../../lib/i18n'

function sceneFor(stage: StoryStage): ReactNode {
  switch (stage) {
    case 'discharge':
      return (
        <div className="pt-1">
          <StoryCheck>{t.story.carePlanCreated}</StoryCheck>
        </div>
      )
    case 'handoff':
      return <CareHandoffCard />
    case 'home':
      return <PatientCheckIn />
    case 'monitoring':
      return <MonitoringCard />
    case 'risk':
      return <RiskIndicator />
    case 'alert':
      return <ClinicalAlert />
    case 'complete':
      return (
        <div className="story-reveal pt-1">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-panel-muted">
            {t.story.complete.line1}
          </p>
          <p className="mt-1 font-serif text-[1.0625rem] leading-snug text-panel-ink">
            {t.story.complete.line2}
          </p>
        </div>
      )
    default:
      return null
  }
}

interface Props {
  stage: StoryStage
  leaving: StoryStage | null
}

export const CareTwinStory: React.FC<Props> = ({ stage, leaving }) => (
  <div className="grid gap-6 sm:grid-cols-[minmax(0,164px)_minmax(0,1fr)]">
    <div className="order-2 sm:order-1">
      <StoryTimeline stage={stage} />
    </div>

    <div className="relative order-1 min-h-[16.5rem] sm:order-2">
      {leaving && (
        <div key={`out-${leaving}`} className="scene-out absolute inset-x-0 top-0">
          {sceneFor(leaving)}
        </div>
      )}
      <div key={`in-${stage}`} className="scene-in absolute inset-x-0 top-0">
        {sceneFor(stage)}
      </div>
    </div>
  </div>
)
