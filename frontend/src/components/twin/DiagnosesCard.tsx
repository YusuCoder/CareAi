import { dateShort } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { TwinData } from '../../lib/twin'

const IconDx = ({ color }: { color: string }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M12 9.5v6M9 12.5h6" />
  </svg>
)

export const DiagnosesCard: React.FC<{ data: TwinData }> = ({ data }) => (
  <section className="rounded-xl border border-border bg-surface p-4">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[1.0625rem] font-semibold">{t.twin.diagnosesCard}</h3>
      <span className="text-[0.8125rem] text-primary">{t.twin.all} →</span>
    </div>

    {data.diagnoses.length === 0 && (
      <p className="py-6 text-center text-sm text-ink-muted">{t.twin.noData}</p>
    )}

    <ul className="mt-2 divide-y divide-border">
      {data.diagnoses.slice(0, 4).map((diagnosis) => {
        const chronic = diagnosis.type === 'COMORBIDITY'
        const color = chronic ? 'var(--color-synthetic)' : 'var(--color-risk-high)'
        const procedure = data.procedures.find(
          (one) => one.hospitalization_id && one.hospitalization_id === diagnosis.hospitalization_id,
        )
        return (
          <li key={diagnosis.id} className="flex items-start gap-3 py-2.5">
            <span
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
            >
              <IconDx color={color} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.875rem] font-medium">{diagnosis.name}</p>
              <p className="truncate text-[0.75rem] text-ink-muted">
                {procedure ? procedure.name : diagnosis.code}
              </p>
              {diagnosis.diagnosed_at && (
                <p className="tabular text-[0.75rem] text-ink-muted">
                  {chronic ? 'Диагноз с ' : ''}
                  {dateShort(diagnosis.diagnosed_at)}
                </p>
              )}
            </div>
            <span
              className="shrink-0 rounded-md px-2 py-0.5 text-[0.6875rem]"
              style={{
                color,
                backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
              }}
            >
              {chronic ? t.twin.chronicTag : t.twin.current}
            </span>
          </li>
        )
      })}
    </ul>
  </section>
)
