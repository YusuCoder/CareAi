import { useState } from 'react'
import { Link } from 'react-router-dom'

import { RiskBadge } from '../PatientRow'
import { DashboardIcon } from './DashboardIcon'
import { relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { AttentionEvent, PatientWithTwin } from '../../lib/queries'
import type { RiskLevel } from '../../lib/database.types'

const RANK: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

interface Card {
  patientId: string
  name: string
  number: number
  risk: RiskLevel | null
  latest: AttentionEvent | null
}

export const AttentionList: React.FC<{
  patients: PatientWithTwin[]
  events: AttentionEvent[]
  loading: boolean
  error?: string | null
}> = ({ patients, events, loading, error }) => {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'risk' | 'events'>('all')
  const [expanded, setExpanded] = useState(false)
  const cards = new Map<string, Card>()

  for (const patient of patients) {
    const risk = patient.digital_twins?.[0]?.risk_level ?? null
    if (risk === 'HIGH' || risk === 'CRITICAL') {
      cards.set(patient.id, {
        patientId: patient.id,
        name: `${patient.last_name} ${patient.first_name}`,
        number: patient.patient_number,
        risk,
        latest: null,
      })
    }
  }

  for (const event of events) {
    if (!event.patient) continue
    const existing = cards.get(event.patient.id)
    if (existing) {
      if (!existing.latest) existing.latest = event
    } else {
      cards.set(event.patient.id, {
        patientId: event.patient.id,
        name: `${event.patient.last_name} ${event.patient.first_name}`,
        number: event.patient.patient_number,
        risk: null,
        latest: event,
      })
    }
  }

  const ordered = [...cards.values()].sort((a, b) => {
    const byRisk = (a.risk ? RANK[a.risk] : 9) - (b.risk ? RANK[b.risk] : 9)
    if (byRisk !== 0) return byRisk
    const at = a.latest ? new Date(a.latest.occurred_at).getTime() : 0
    const bt = b.latest ? new Date(b.latest.occurred_at).getTime() : 0
    return bt - at
  })
  const filtered = ordered.filter(card => {
    const matchesQuery = `${card.name} ${card.number}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))
    return matchesQuery && (filter === 'all' || (filter === 'risk' ? card.risk === 'HIGH' || card.risk === 'CRITICAL' : Boolean(card.latest)))
  })
  const visible = expanded ? filtered : filtered.slice(0, 6)

  return (
    <section className="overview-queue" aria-busy={loading}>
      <header className="overview-queue__header">
        <div><span className="overview-kicker">ПРИОРИТЕТЫ</span><h2>Требуют внимания <span className="overview-count">{loading || error ? '—' : ordered.length}</span></h2><p>Высокий риск и последние тревожные события. Откройте пациента, чтобы оценить ситуацию.</p></div>
        <span className="overview-icon" data-tone="rose"><DashboardIcon name="pulse" /></span>
      </header>
      <div className="overview-queue__tools">
        <div className="overview-filters" role="group" aria-label="Фильтр приоритетов">{([['all', 'Все'], ['risk', 'Высокий риск'], ['events', 'Есть события']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setExpanded(false) }}>{label}</button>)}</div>
        <label className="overview-search"><DashboardIcon name="search" /><input aria-label="Найти пациента в приоритетах" placeholder="Имя или № карты" value={query} onChange={event => { setQuery(event.target.value); setExpanded(false) }} /></label>
      </div>
      {error && <p className="overview-error" role="alert">Список может быть неполным: {error}</p>}
      {loading && <div className="overview-loading" role="status"><span className="overview-loading__bar" /><span className="overview-loading__bar" /><span className="overview-loading__bar" /><p>{t.common.loading}</p></div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="overview-empty"><DashboardIcon name={ordered.length ? 'search' : 'check'} /><strong>{ordered.length ? 'Ничего не найдено' : 'В списке пока нет пациентов'}</strong><p>{ordered.length ? 'Попробуйте другое имя или измените фильтр.' : 'Пациенты с высоким риском и тревожными событиями появятся здесь.'}</p></div>
      )}
      {!loading && <ul className="overview-queue__list">
        {visible.map((card) => (
          <li key={card.patientId}>
            <Link
              to={`/patients/${card.patientId}`}
              className="overview-patient"
            >
              <span className="overview-patient__avatar" aria-hidden>{card.name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span>
              <span className="overview-patient__info">
                <span className="overview-patient__name">{card.name} <small>№{card.number}</small></span>
                {card.latest && (
                  <span className="overview-patient__event">
                    {t.overview.changed}: {card.latest.title}
                  </span>
                )}
              </span>

              <span className="overview-patient__status">{card.risk && <RiskBadge level={card.risk} />}<time dateTime={card.latest?.occurred_at}>{card.latest ? relativeTime(card.latest.occurred_at) : 'По статусу двойника'}</time></span>
              <span className="overview-patient__open"><span>Карточка</span><DashboardIcon name="arrow" /></span>
            </Link>
          </li>
        ))}
      </ul>}
      {!loading && filtered.length > 6 && <button className="overview-show-more" type="button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Свернуть список' : `Показать всех: ${filtered.length}`}</button>}
    </section>
  )
}
