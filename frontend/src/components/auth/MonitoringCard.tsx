import { StoryCard } from './StoryCard'
import { t } from '../../lib/i18n'

interface SeriesProps {
  label: string
  values: string[]
  unit: string
  startDelay: number
}

const Series: React.FC<SeriesProps> = ({ label, values, unit, startDelay }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[0.8125rem] text-panel-muted">{label}</p>
      <p className="text-[0.6875rem] text-panel-muted">{unit}</p>
    </div>
    <div className="tabular mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      {values.map((value, index) => {
        const last = index === values.length - 1
        return (
          <span key={value} className="flex items-baseline gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-[0.75rem] text-panel-muted/70">
                →
              </span>
            )}
            <span
              className="story-reveal text-[0.9375rem]"
              style={{
                animationDelay: `${startDelay + index * 260}ms`,
                color: last ? 'var(--color-spine-alert)' : 'var(--color-panel-ink)',
                fontWeight: last ? 500 : 400,
              }}
            >
              {value}
              {last && <span aria-hidden> ↑</span>}
            </span>
          </span>
        )
      })}
    </div>
  </div>
)

export const MonitoringCard: React.FC = () => (
  <StoryCard label={t.story.monitoring.label}>
    <div className="space-y-4">
      <Series
        label={t.story.monitoring.temperature}
        unit={t.story.monitoring.temperatureUnit}
        values={['36,8', '37,1', '37,4', '38,2']}
        startDelay={120}
      />
      <Series
        label={t.story.monitoring.heartRate}
        unit={t.story.monitoring.heartRateUnit}
        values={['78', '82', '91', '108']}
        startDelay={420}
      />
    </div>
  </StoryCard>
)
