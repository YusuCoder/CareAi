import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  usePatientAssistant, type AssistantPatient, type AssistantRecord, type ChatMessage, type HighlightLevel,
} from '../../lib/assistant'
import { riskColor } from '../../lib/format'
import { t } from '../../lib/i18n'

const LEVEL_COLOR: Record<HighlightLevel, string> = {
  DANGER: 'var(--color-risk-critical)',
  WARN: 'var(--color-risk-medium)',
  INFO: 'var(--color-ink-muted)',
}

const tint = (color: string, amount = 10) => `color-mix(in oklab, ${color} ${amount}%, transparent)`

const RiskBadge: React.FC<{ level: AssistantPatient['risk_level'] }> = ({ level }) =>
  level ? (
    <span
      className="rounded px-1.5 py-0.5 text-[0.6875rem] font-medium"
      style={{ color: riskColor[level], backgroundColor: tint(riskColor[level], 12) }}
    >
      {t.assistant.risk[level]}
    </span>
  ) : null

const PatientChoice: React.FC<{ patient: AssistantPatient; onPick: () => void; disabled: boolean }> = ({
  patient, onPick, disabled,
}) => (
  <button
    type="button"
    onClick={onPick}
    disabled={disabled}
    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40 disabled:opacity-60"
  >
    <div className="flex items-center gap-2">
      <span className="text-[0.8125rem] font-semibold">{patient.name}</span>
      <RiskBadge level={patient.risk_level} />
      <span className="tabular ml-auto text-[0.6875rem] text-ink-muted">№{patient.patient_number ?? '—'}</span>
    </div>
    <p className="tabular mt-0.5 text-[0.75rem] text-ink-muted">
      {[
        patient.age !== null ? `${patient.age} ${t.assistant.years}` : null,
        patient.birth_date ? `${t.assistant.born} ${patient.birth_date}` : null,
        patient.national_id ? `${t.assistant.pinfl} ${patient.national_id}` : null,
        patient.district,
      ].filter(Boolean).join(' · ')}
    </p>
  </button>
)

const Section: React.FC<{ title: string; empty: boolean; tone?: string; children: React.ReactNode }> = ({
  title, empty, tone, children,
}) => (
  <div className="rounded-lg border border-border px-3 py-2.5" style={tone ? { borderColor: tint(tone, 40) } : undefined}>
    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide" style={{ color: tone ?? 'var(--color-ink-muted)' }}>
      {title}
    </p>
    {empty
      ? <p className="mt-1 text-[0.75rem] text-ink-muted">{t.assistant.none}</p>
      : <ul className="mt-1 space-y-0.5 text-[0.8125rem] leading-snug">{children}</ul>}
  </div>
)

const RecordSummary: React.FC<{ message: ChatMessage; record: AssistantRecord }> = ({ message, record }) => {
  const { patient } = record

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{patient.name}</p>
        <RiskBadge level={patient.risk_level} />
        <span className="tabular text-[0.75rem] text-ink-muted">
          {[
            patient.age !== null ? `${patient.age} ${t.assistant.years}` : null,
            `№${patient.patient_number ?? '—'}`,
            patient.national_id ? `${t.assistant.pinfl} ${patient.national_id}` : null,
          ].filter(Boolean).join(' · ')}
        </span>
        <Link to={`/patients/${patient.id}`} className="ml-auto text-[0.8125rem] font-medium text-primary hover:underline">
          {t.assistant.openTwin} →
        </Link>
      </div>

      {message.overview && <p className="text-[0.875rem] leading-relaxed">{message.overview}</p>}

      {message.highlights && message.highlights.length > 0 && (
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">{t.assistant.highlights}</p>
          <ul className="mt-1.5 space-y-1.5">
            {message.highlights.map((item, index) => (
              <li
                key={index}
                className="rounded-md border-l-[3px] px-2.5 py-1.5"
                style={{ borderColor: LEVEL_COLOR[item.level], backgroundColor: tint(LEVEL_COLOR[item.level], 8) }}
              >
                <p className="text-[0.8125rem]">
                  <span className="font-semibold" style={{ color: LEVEL_COLOR[item.level] }}>
                    {t.assistant.levels[item.level]}:
                  </span>{' '}
                  {item.text}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-muted">
                  {item.evidence.map((source) => source.text).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Section
          title={t.assistant.allergies}
          empty={record.allergies.length === 0}
          tone={record.allergies.length > 0 ? 'var(--color-risk-critical)' : undefined}
        >
          {record.allergies.map((item) => (
            <li key={item.id}>
              <span className="font-medium">{item.substance}</span>
              {item.reaction && <span className="text-ink-muted"> — {item.reaction}</span>}
              <span className="text-ink-muted"> · {t.assistant.severity[item.severity as keyof typeof t.assistant.severity] ?? item.severity}</span>
            </li>
          ))}
        </Section>

        <Section title={t.assistant.diagnosesActive} empty={record.diagnoses_active.length === 0}>
          {record.diagnoses_active.map((item) => (
            <li key={item.id}>
              {item.name}
              {item.code && <span className="text-ink-muted"> ({item.code})</span>}
            </li>
          ))}
        </Section>

        <Section title={t.assistant.medications} empty={record.medications.length === 0}>
          {record.medications.map((item) => <li key={item.id}>{item.text}</li>)}
        </Section>

        <Section
          title={t.assistant.labsAbnormal}
          empty={record.labs_abnormal.length === 0}
          tone={record.labs_abnormal.some((item) => item.flag === 'CRITICAL') ? 'var(--color-risk-critical)' : undefined}
        >
          {record.labs_abnormal.map((item) => (
            <li key={item.id} className="tabular">
              {item.analyte}: <span className="font-medium">{item.value}</span>
              <span className="text-ink-muted"> · {t.assistant.flags[item.flag as keyof typeof t.assistant.flags] ?? item.flag} · {item.date}</span>
            </li>
          ))}
        </Section>

        <Section title={t.assistant.diagnosesPast} empty={record.diagnoses_past.length === 0}>
          {record.diagnoses_past.map((item) => (
            <li key={item.id}>
              {item.name}
              {item.resolved && <span className="tabular text-ink-muted"> · {t.assistant.resolved} {item.resolved}</span>}
            </li>
          ))}
        </Section>

        <Section title={t.assistant.hospitalizations} empty={record.hospitalizations.length === 0}>
          {record.hospitalizations.map((item) => (
            <li key={item.id}>
              <span className="tabular text-ink-muted">{item.from}–{item.to || t.assistant.now}</span> {item.diagnosis}
            </li>
          ))}
        </Section>

        {record.events.length > 0 && (
          <Section title={t.assistant.events} empty={false} tone="var(--color-risk-medium)">
            {record.events.map((item) => (
              <li key={item.id}>
                <span className="tabular text-ink-muted">{item.date}</span> {item.title}
              </li>
            ))}
          </Section>
        )}

        {record.lifestyle.length > 0 && (
          <Section title={t.assistant.lifestyle} empty={false}>
            {record.lifestyle.map((item) => <li key={item.id}>{item.text}</li>)}
          </Section>
        )}
      </div>

      <p className="text-[0.6875rem] text-ink-muted">{t.assistant.grounding}</p>
    </div>
  )
}

export const PatientAssistant: React.FC = () => {
  const { messages, loading, send, reset } = usePatientAssistant()
  const [draft, setDraft] = useState<string>('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages, loading])

  const submit = (content: string, patientId?: string) => {
    if (!content.trim() || loading) return
    setDraft('')
    void send(content, patientId)
  }

  const last = messages[messages.length - 1]

  return (
    <section className="overflow-hidden rounded-xl border border-primary/20 bg-surface">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-primary-soft/40 px-4 py-3">
        <h2 className="text-sm font-semibold text-primary">{t.assistant.title}</h2>
        <p className="text-xs text-ink-muted">{t.assistant.subtitle}</p>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            disabled={loading}
            className="ml-auto rounded-md border border-primary/25 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {t.assistant.reset}
          </button>
        )}
      </header>

      {messages.length > 0 && (
        <div className="max-h-[36rem] space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <div key={index} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[0.875rem] text-white">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={index} className="max-w-full">
                {message.failed ? (
                  <p className="text-[0.8125rem] text-risk-critical">{t.assistant.failed}</p>
                ) : (
                  <>
                    {message.content && (
                      <p className="max-w-[90%] rounded-2xl rounded-bl-sm bg-surface-sunken px-3.5 py-2 text-[0.875rem] leading-relaxed">
                        {message.content}
                      </p>
                    )}

                    {message.patients && message.patients.length > 0 && (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {message.patients.map((patient) => (
                          <PatientChoice
                            key={patient.id}
                            patient={patient}
                            disabled={loading || message !== last}
                            onPick={() => submit(`${patient.name}, ${t.assistant.card} №${patient.patient_number ?? '—'}`, patient.id)}
                          />
                        ))}
                      </div>
                    )}

                    {message.record && <RecordSummary message={message} record={message.record} />}
                  </>
                )}
              </div>
            ),
          )}

          {loading && <p className="text-[0.8125rem] text-ink-muted">{t.assistant.thinking}</p>}

          {!loading && last?.role === 'assistant' && last.suggestions && last.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {last.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="rounded-full border border-primary/30 px-3 py-1 text-[0.8125rem] text-primary transition-colors hover:bg-primary-soft"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div ref={bottom} />
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(draft)
        }}
        className="flex gap-2 border-t border-border px-4 py-3"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder={t.assistant.placeholder}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[0.875rem]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || loading}
          className="rounded-lg bg-primary px-4 py-2 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {t.assistant.send}
        </button>
      </form>
    </section>
  )
}
