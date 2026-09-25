import { NODES_VISIBLE, type StoryStage } from './storySequence'
import { t } from '../../lib/i18n'

interface Node {
  label: string
  detail: string
  phase: 'hospital' | 'home'
  marker: 'dot' | 'discharge' | 'attention'
}

const NODES: Node[] = [
  { label: t.story.timeline.admitted, detail: t.story.timeline.admittedDate, phase: 'hospital', marker: 'dot' },
  { label: t.story.timeline.surgery, detail: t.story.timeline.surgeryDate, phase: 'hospital', marker: 'dot' },
  { label: t.story.timeline.discharged, detail: t.story.timeline.dischargedDate, phase: 'home', marker: 'discharge' },
  { label: t.story.timeline.polyclinic, detail: t.story.timeline.polyclinicDetail, phase: 'home', marker: 'dot' },
  { label: t.story.timeline.home, detail: t.story.timeline.homeDetail, phase: 'home', marker: 'dot' },
  { label: t.story.timeline.risk, detail: t.story.timeline.riskDetail, phase: 'home', marker: 'attention' },
  { label: t.story.timeline.notified, detail: t.story.timeline.notifiedDetail, phase: 'home', marker: 'dot' },
]

const Marker: React.FC<Pick<Node, 'marker' | 'phase'>> = ({ marker, phase }) => {
  if (marker === 'discharge') {
    return <span className="story-node-mark mt-1.5 block size-3 rotate-45 bg-white" />
  }
  if (marker === 'attention') {
    return (
      <span
        className="story-node-mark mt-2 block size-3 rounded-full ring-4 ring-white/12"
        style={{ backgroundColor: 'var(--color-spine-alert)' }}
      />
    )
  }
  return (
    <span
      className="story-node-mark mt-2 block size-3 rounded-full"
      style={{
        backgroundColor:
          phase === 'hospital' ? 'var(--color-spine-hospital)' : 'var(--color-spine-home)',
      }}
    />
  )
}

export const StoryTimeline: React.FC<{ stage: StoryStage }> = ({ stage }) => {
  const visible = NODES_VISIBLE[stage]

  return (
    <ol className="relative">
      {NODES.map((node, index) => {
        const shown = index < visible
        return (
          <li
            key={node.label}
            data-phase={node.phase}
            data-shown={shown || undefined}
            className="story-node relative grid grid-cols-[12px_1fr] gap-x-4 pb-6 last:pb-0"
          >
            <Marker marker={node.marker} phase={node.phase} />
            <div className="-mt-0.5 min-w-0">
              <p className="truncate text-[0.875rem] leading-snug text-panel-ink">{node.label}</p>
              <p className="tabular truncate text-[0.75rem] leading-snug text-panel-muted">
                {node.detail}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
