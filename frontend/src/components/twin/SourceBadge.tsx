import type { ClinicalSource } from '../../lib/database.types'
import { t } from '../../lib/i18n'

const tone: Record<ClinicalSource, string> = {
  HOSPITAL: 'var(--color-phase-hospital)',
  POLYCLINIC: 'var(--color-phase-hospital)',
  NURSE: 'var(--color-phase-home)',
  PATIENT: 'var(--color-risk-medium)',
  DEVICE: 'var(--color-synthetic)',
  AI_DRAFT: 'var(--color-ink-muted)',
}

export const SourceBadge: React.FC<{ source: ClinicalSource }> = ({ source }) => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none"
    style={{
      color: tone[source],
      backgroundColor: `color-mix(in oklab, ${tone[source]} 12%, transparent)`,
    }}
  >
    {t.twin.sources[source]}
  </span>
)
