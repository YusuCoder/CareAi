import { useEffect, useState } from 'react'

import { IconTelegram } from './icons'
import { dateTime, relativeTime, riskColor } from '../../lib/format'
import { riskLabel, t } from '../../lib/i18n'
import { useRealtimeVersion } from '../../lib/realtime'
import { supabase } from '../../lib/supabase'
import { QUESTION_LABEL, THRESHOLD_META, frequencyLabel, type RuleQuestion } from '../../lib/checkInRules'
import type { AlertRow, CheckInSchedule, PatientCheckIn, TwinEvent } from '../../lib/database.types'
import type { TwinData } from '../../lib/twin'

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '')
const RED = 'var(--color-risk-critical)'

type Person = { first_name: string | null; last_name: string | null } | null
type AlertWithPeople = AlertRow & { acknowledger: Person; resolver: Person }

type Item =
  | { kind: 'check_in'; at: string; row: PatientCheckIn }
  | { kind: 'alert'; at: string; row: AlertWithPeople }
  | { kind: 'linked'; at: string; row: TwinEvent }

const person = (p: Person) =>
  p ? [p.last_name, p.first_name].filter(Boolean).join(' ') || t.telegram.staff : t.telegram.staff

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })

const num = (value: unknown) => (typeof value === 'number' ? String(value).replace('.', ',') : null)

/** «Т 38,2 °C · SpO₂ 89% · пульс 106 · …» из ответов опроса. */
function answersLine(answers: PatientCheckIn['answers']): string {
  const a = answers as Record<string, Record<string, unknown> | undefined>
  const choice = (step: string, labels: Record<string, string>) => {
    const value = a[step]?.choice
    return typeof value === 'string' ? labels[value] ?? value : null
  }
  const parts = [
    num(a.TEMPERATURE?.value) && `Т ${num(a.TEMPERATURE?.value)} °C`,
    num(a.SPO2?.value) && `SpO₂ ${num(a.SPO2?.value)}%`,
    num(a.HEART_RATE?.value) && `пульс ${num(a.HEART_RATE?.value)}`,
    a.BLOOD_PRESSURE?.systolic !== undefined && `АД ${a.BLOOD_PRESSURE?.systolic}/${a.BLOOD_PRESSURE?.diastolic}`,
    choice('WELLBEING', { BETTER: 'лучше', SAME: 'так же', WORSE: 'хуже' }) &&
      `самочувствие: ${choice('WELLBEING', { BETTER: 'лучше', SAME: 'так же', WORSE: 'хуже' })}`,
    choice('DYSPNEA', { NONE: 'нет', SAME: 'как вчера', WORSE: 'сильнее' }) &&
      `одышка: ${choice('DYSPNEA', { NONE: 'нет', SAME: 'как вчера', WORSE: 'сильнее' })}`,
    a.SYMPTOMS?.choice === 'YES'
      ? `новые симптомы${typeof a.SYMPTOMS?.text === 'string' ? `: «${a.SYMPTOMS.text}»` : ''}`
      : a.SYMPTOMS?.choice === 'NO' && 'новых симптомов нет',
    choice('MEDICATIONS', { YES: 'приняты', NO: 'не все' }) &&
      `лекарства: ${choice('MEDICATIONS', { YES: 'приняты', NO: 'не все' })}`,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Действующие правила опроса: откуда взялись и что именно спрашиваем. */
const RulesSummary: React.FC<{ rules: CheckInSchedule | null }> = ({ rules }) => {
  const r = t.telegramRules
  if (!rules) return <p className="mt-3 text-[0.8125rem] text-ink-muted">{r.none}</p>

  const personal = Object.entries(rules.thresholds ?? {})
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-[0.8125rem]">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{r.active}</span>
        <span className="text-xs text-ink-muted">
          {r.fromDischarge}{rules.source === 'AI' ? ` · ${r.byAi} (CareTwin AI)` : rules.source === 'DOCTOR' ? ' · врачом' : ''}
        </span>
      </p>
      <p className="mt-1">
        {frequencyLabel(rules.times.map((time) => time.slice(0, 5)), rules.every_n_days)}
        {rules.end_date && ` · до ${dateTime(`${rules.end_date}T00:00:00`).split(',')[0]}`}
        {` · ждём ответ ${rules.response_window_hours} ч`}
      </p>
      <p className="mt-0.5 text-ink-muted">
        {rules.questions.map((q) => QUESTION_LABEL[q as RuleQuestion] ?? q).join(', ')}
      </p>
      {personal.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {personal.map(([code, value]) => {
            const meta = THRESHOLD_META[code]
            if (!meta) return null
            const sign = meta.direction === 'ABOVE' ? '≥' : '≤'
            return (
              <li key={code}>
                {meta.label}: {value.medium !== undefined && `${r.medium} ${sign} ${value.medium}`}
                {value.medium !== undefined && value.high !== undefined && ', '}
                {value.high !== undefined && `${r.high} ${sign} ${value.high}`} {meta.unit}
                {value.quote && <span className="text-ink-muted"> · «{value.quote}»</span>}
              </li>
            )
          })}
        </ul>
      )}
      {rules.requirements && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-primary">Требования врача</summary>
          <p className="mt-1 whitespace-pre-line text-xs">{rules.requirements}</p>
        </details>
      )}
    </div>
  )
}

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium text-white" style={{ backgroundColor: color }}>
    {children}
  </span>
)

const CheckInItem: React.FC<{ row: PatientCheckIn }> = ({ row }) => {
  const line = answersLine(row.answers)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{t.telegram.checkIn}</span>
        <span className="text-xs text-ink-muted">
          {t.telegram.status[row.status]} · {t.telegram.trigger[row.trigger]}
        </span>
        {row.risk_level && (
          <span className="ml-auto"><Badge color={riskColor[row.risk_level]}>{riskLabel[row.risk_level]}</Badge></span>
        )}
      </div>
      <p className="mt-0.5 text-ink-muted">{line || t.telegram.noAnswers}</p>
    </>
  )
}

const AlertItem: React.FC<{ row: AlertWithPeople }> = ({ row }) => {
  const sos = row.kind === 'EMERGENCY'
  const color = sos ? RED : riskColor[row.level]
  const waiting = row.status === 'OPEN'

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge color={color}>{sos ? 'SOS' : row.kind === 'RISK' ? riskLabel[row.level] : t.alerts.kind.MISSED_CHECK_IN}</Badge>
        <span className="min-w-0 font-medium">{row.title}</span>
      </div>

      {row.reasons.length > 0 && !sos && (
        <p className="mt-0.5 text-ink-muted">{row.reasons.slice(0, 3).map((reason) => reason.detail).join('; ')}</p>
      )}
      {sos && row.latitude !== null && (
        <a
          href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-block text-xs text-primary hover:underline"
        >
          📍 {t.alerts.sos.openMap}
        </a>
      )}

      {/* реакции медперсонала, по порядку */}
      <ul className="mt-1.5 space-y-0.5 border-l-2 border-border pl-3 text-xs">
        {row.acknowledged_at && (
          <li>✓ {t.telegram.acknowledged} — {person(row.acknowledger)} · {clock(row.acknowledged_at)}</li>
        )}
        {row.visit_eta && <li>🚑 {t.alerts.sos.etaSet} {clock(row.visit_eta)}</li>}
        {row.resolved_at && (
          <li>
            ■ {t.telegram.resolved} — {person(row.resolver)} · {clock(row.resolved_at)}
            {row.resolution_note && <span className="text-ink-muted"> · «{row.resolution_note}»</span>}
          </li>
        )}
        {waiting && (
          <li className="font-medium" style={{ color: RED }}>
            {t.telegram.noReaction} · {relativeTime(row.created_at)}
          </li>
        )}
      </ul>

      {row.ai_summary && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-primary">{t.alerts.aiTitle}</summary>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed">{row.ai_summary}</p>
          <p className="mt-1 text-[0.6875rem] text-ink-muted">{t.alerts.aiDisclaimer}</p>
        </details>
      )}
    </>
  )
}

/**
 * Вкладка «Telegram»: привязка бота и вся история из него — опросы, тревоги,
 * SOS и реакции медсестры. Для врачей это единственное место, где видны данные
 * бота: на их панели и в общей хронологии их нет.
 */
export const TelegramPanel: React.FC<{ data: TwinData }> = ({ data }) => {
  const patient = data.patient
  const patientId = patient?.id
  const [items, setItems] = useState<Item[]>([])
  const [rules, setRules] = useState<CheckInSchedule | null>(null)
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const filter = patientId ? `patient_id=eq.${patientId}` : undefined
  const alertsVersion = useRealtimeVersion('alerts', { filter, enabled: Boolean(patientId) })
  const eventsVersion = useRealtimeVersion('twin_events', { filter, enabled: Boolean(patientId) })

  useEffect(() => {
    if (!patientId) return
    let cancelled = false

    void Promise.all([
      supabase.from('patient_check_ins').select('*').eq('patient_id', patientId)
        .order('started_at', { ascending: false }).limit(30),
      supabase.from('alerts')
        .select('*, acknowledger:profiles!alerts_acknowledged_by_fkey(first_name, last_name), resolver:profiles!alerts_resolved_by_fkey(first_name, last_name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('twin_events').select('*').eq('patient_id', patientId)
        .eq('event_type', 'TELEGRAM_LINKED').order('occurred_at', { ascending: false }).limit(5),
      supabase.from('check_in_schedules').select('*').eq('patient_id', patientId).eq('active', true).maybeSingle(),
    ]).then(([checkIns, alerts, linked, schedule]) => {
      if (cancelled) return
      setRules((schedule.data ?? null) as CheckInSchedule | null)
      const merged: Item[] = [
        ...((checkIns.data ?? []) as PatientCheckIn[]).map((row) => ({ kind: 'check_in' as const, at: row.started_at, row })),
        // тревоги из опросов, SOS и пропуски; риск от других данных сюда не относится
        ...((alerts.data ?? []) as unknown as AlertWithPeople[])
          .filter((row) => row.kind !== 'RISK' || row.check_in_id !== null)
          .map((row) => ({ kind: 'alert' as const, at: row.created_at, row })),
        ...((linked.data ?? []) as unknown as TwinEvent[]).map((row) => ({ kind: 'linked' as const, at: row.occurred_at, row })),
      ]
      merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      setItems(merged)
    })

    return () => {
      cancelled = true
    }
  }, [patientId, alertsVersion, eventsVersion])

  if (!patient) return null
  const linked = patient.telegram_id !== null
  const link = code && BOT ? `https://t.me/${BOT}?start=${code.code}` : null

  const issue = async () => {
    setBusy(true)
    setError(null)
    const { data: rows, error: failure } = await supabase.rpc('issue_telegram_link_code', { p_patient_id: patient.id })
    if (failure) setError(failure.message)
    else setCode((rows as { code: string; expires_at: string }[])[0] ?? null)
    setBusy(false)
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(value)
    } catch {
      setCopied(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-primary"><IconTelegram /></span>
        <h3 className="text-[1.0625rem] font-semibold">{t.telegram.title}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
          style={linked
            ? { color: 'var(--color-risk-low)', backgroundColor: 'color-mix(in oklab, var(--color-risk-low) 12%, transparent)' }
            : { color: 'var(--color-ink-muted)', backgroundColor: 'var(--color-surface-sunken)' }}
        >
          {linked ? t.telegram.linked : t.telegram.notLinked}
        </span>
      </div>
      <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-snug text-ink-muted">{t.telegram.subtitle}</p>

      <RulesSummary rules={rules} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void issue()}
          className="rounded-md bg-primary-soft px-3 py-1.5 text-[0.8125rem] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
        >
          {linked || code ? t.telegram.reissue : t.telegram.issueCode}
        </button>
        {error && <span className="text-xs text-risk-critical">{error}</span>}
      </div>

      {code && (
        <div className="mt-3 space-y-1.5 rounded-md bg-surface-sunken px-3 py-2.5 text-[0.8125rem]">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-ink-muted">{t.telegram.codeLabel}:</span>
            <code className="font-semibold tracking-wider">{code.code}</code>
            <button type="button" onClick={() => void copy(code.code)} className="text-xs text-primary hover:underline">
              {copied === code.code ? t.telegram.copied : t.telegram.copy}
            </button>
          </p>
          {link ? (
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-ink-muted">{t.telegram.linkLabel}:</span>
              <a href={link} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{link}</a>
              <button type="button" onClick={() => void copy(link)} className="text-xs text-primary hover:underline">
                {copied === link ? t.telegram.copied : t.telegram.copy}
              </button>
            </p>
          ) : (
            <p className="text-xs text-ink-muted">{t.telegram.noBotName}</p>
          )}
          <p className="text-xs text-ink-muted">{t.telegram.codeHint} · до {dateTime(code.expires_at)}</p>
        </div>
      )}

      <h4 className="mt-5 text-[0.8125rem] font-semibold">{t.telegram.history}</h4>
      {items.length === 0 ? (
        <p className="mt-1 text-[0.8125rem] text-ink-muted">{t.telegram.noCheckIns}</p>
      ) : (
        <ol className="mt-2 divide-y divide-border">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.row.id}`}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-2.5 text-[0.8125rem]"
            >
              <span className="tabular text-xs text-ink-muted">{dateTime(item.at)}</span>
              <div className="min-w-0">
                {item.kind === 'check_in' && <CheckInItem row={item.row} />}
                {item.kind === 'alert' && <AlertItem row={item.row} />}
                {item.kind === 'linked' && (
                  <p>
                    <span className="font-medium">{item.row.title}</span>
                    {item.row.description && <span className="text-ink-muted"> · {item.row.description}</span>}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
