import { decimal } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { MedicationFrequency } from '../../lib/database.types'
import type { TwinData } from '../../lib/twin'

const TIMES: Partial<Record<MedicationFrequency, string>> = {
  ONCE_DAILY: '1 раз в день',
  TWICE_DAILY: '2 раза в день',
  THREE_TIMES_DAILY: '3 раза в день',
  FOUR_TIMES_DAILY: '4 раза в день',
  EVERY_OTHER_DAY: 'через день',
  WEEKLY: 'раз в неделю',
  AS_NEEDED: 'по необходимости',
}

const IconPill = ({ color }: { color: string }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" aria-hidden>
    <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)" /><path d="M9.2 9.2l5.6 5.6" />
  </svg>
)

export const MedicationsCard: React.FC<{ data: TwinData }> = ({ data }) => {
  const active = data.medications.filter((medication) => medication.status === 'ACTIVE')

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[1.0625rem] font-semibold">{t.twin.medicationsCard}</h3>
        <span className="text-[0.8125rem] text-primary">{t.twin.all} →</span>
      </div>

      {active.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-muted">{t.twin.noData}</p>
      )}

      <ul className="mt-2 divide-y divide-border">
        {active.slice(0, 4).map((medication) => (
          <li key={medication.id} className="flex items-center gap-3 py-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'color-mix(in oklab, var(--color-risk-low) 12%, transparent)' }}
            >
              <IconPill color="var(--color-risk-low)" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.875rem] font-medium">{medication.name}</p>
              <p className="tabular truncate text-[0.75rem] text-ink-muted">
                {[
                  medication.dose !== null ? `${decimal(medication.dose, 0)} ${medication.dose_unit ?? ''}`.trim() : null,
                  medication.frequency ? TIMES[medication.frequency] : medication.frequency_text,
                ].filter(Boolean).join(', ')}
              </p>
            </div>
            <span
              className="shrink-0 rounded-md px-2 py-0.5 text-[0.6875rem]"
              style={{
                color: 'var(--color-risk-low)',
                backgroundColor: 'color-mix(in oklab, var(--color-risk-low) 12%, transparent)',
              }}
            >
              {t.twin.activeTag}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
