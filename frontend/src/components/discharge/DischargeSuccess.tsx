import { Link } from 'react-router-dom'

import { t } from '../../lib/i18n'
import type { DischargeResult } from '../../lib/discharge'
import { Sparkle } from './ui'

/**
 * Показываем только то, что подтвердил ответ discharge_patient: план и вызов —
 * по возвращённым id, осмотры — по отправленному графику (они пишутся в той же
 * транзакции, так что успех RPC означает, что они созданы).
 */
export const DischargeSuccess: React.FC<{
  result: DischargeResult
  patientName: string
  hospitalName: string | null
  clinicName: string | null
  visitCount: number
}> = ({ result, patientName, hospitalName, clinicName, visitCount }) => {
  const f = t.dischargeFlow
  const hasPlan = Boolean(result.care_plan_id)
  const hasCall = Boolean(result.active_call_id)

  const flow: { label: string; accent?: boolean }[] = [
    { label: hospitalName ?? f.flowHospital },
    { label: f.successTwin, accent: true },
    ...(hasPlan ? [{ label: clinicName ?? t.common.dash }, { label: f.successCase }, { label: f.flowHome }] : []),
  ]

  const done: { label: string; ok: boolean }[] = [
    { label: f.successTitle, ok: true },
    { label: f.successTwin, ok: true },
    ...(hasPlan
      ? [
          { label: f.successPlan, ok: true },
          ...(visitCount > 0 ? [{ label: `${f.successVisits}: ${visitCount}`, ok: true }] : []),
        ]
      : [{ label: f.successNoPlan, ok: false }]),
    ...(hasCall ? [{ label: `${clinicName ?? t.discharge.clinic} ${f.successCall}`, ok: true }] : []),
  ]

  return (
    <div className="mx-auto max-w-2xl py-4">
      <section className="ai-card handoff-in rounded-2xl p-6 text-center" role="status">
        <span
          className="check-pop mx-auto flex size-12 items-center justify-center rounded-full text-xl text-white"
          style={{ backgroundColor: 'var(--color-risk-low)' }}
          aria-hidden
        >
          ✓
        </span>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">{f.successTitle}</h2>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">{patientName}</p>

        <ol className="mx-auto mt-6 flex max-w-xs flex-col items-center gap-1">
          {flow.map((node, index) => (
            <li
              key={node.label + index}
              className="handoff-in flex flex-col items-center gap-1"
              style={{ animationDelay: `${150 + index * 160}ms` }}
            >
              {index > 0 && <span aria-hidden className="text-ink-muted">↓</span>}
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${
                  node.accent ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border bg-surface'
                }`}
              >
                {node.accent && <Sparkle size={12} />}
                {node.label}
              </span>
            </li>
          ))}
        </ol>

        <ul className="mx-auto mt-6 max-w-sm space-y-1.5 text-left">
          {done.map((item, index) => (
            <li
              key={item.label}
              className="handoff-in flex items-start gap-2 text-[0.8125rem]"
              style={{ animationDelay: `${150 + (flow.length + index) * 120}ms` }}
            >
              <span style={{ color: item.ok ? 'var(--color-risk-low)' : 'var(--color-ink-muted)' }}>
                {item.ok ? '✓' : '○'}
              </span>
              {item.label}
            </li>
          ))}
        </ul>

        {hasPlan && (
          <p className="mt-5 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-primary">
            <Sparkle size={14} /> {f.successMonitoring}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to={`/patients/${result.patient_id}`}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            {t.discharge.openTwin}
          </Link>
          <Link
            to="/post-discharge"
            className="rounded-lg border border-border px-4 py-2.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            {f.backToPatients}
          </Link>
        </div>
      </section>
    </div>
  )
}
