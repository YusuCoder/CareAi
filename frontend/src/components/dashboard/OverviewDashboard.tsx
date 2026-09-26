import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AttentionList } from './AttentionList'
import { ContinuityStrip } from './ContinuityStrip'
import { DashboardIcon } from './DashboardIcon'
import type { AttentionEvent, PatientWithTwin } from '../../lib/queries'
import './OverviewDashboard.css'

interface Props {
  patients: PatientWithTwin[]
  events: AttentionEvent[]
  loading: boolean
  eventsLoading: boolean
  patientError?: string | null
  eventsError?: string | null
  organization: string
  roleName: string
  nurse?: boolean
  alerts: ReactNode
  summary: ReactNode
  assistant: ReactNode
  followUp: ReactNode
}

const steps = [
  ['Выберите пациента', 'Начните со списка «Требуют внимания»: здесь собраны высокий риск и последние тревожные события.'],
  ['Изучите цифрового двойника', 'В карточке пациента доступны показатели, история лечения, назначения и события наблюдения.'],
  ['Определите следующий шаг', 'Проверьте план наблюдения и выполните доступное вашей роли действие. AI поможет собрать контекст.'],
]

export const OverviewDashboard: React.FC<Props> = ({
  patients, events, loading, eventsLoading, patientError, eventsError,
  organization, roleName, nurse = false, alerts, summary, assistant, followUp,
}) => {
  const [showGuide, setShowGuide] = useState(false)
  const [openedAt] = useState(() => Date.now())
  const today = new Date(openedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
  const silent = patients.filter(patient => {
    const twin = patient.digital_twins?.[0]
    return twin?.current_status === 'POST_DISCHARGE_MONITORING' && twin.last_updated_at && openedAt - new Date(twin.last_updated_at).getTime() > 48 * 3600_000
  }).length
  const stages = [
    { status: 'NEW', title: 'Регистрация', note: 'Новые пациенты', icon: 'patients' as const, tone: 'violet' },
    { status: 'HOSPITALIZED', title: 'Лечение', note: 'В стационаре', icon: 'hospital' as const, tone: 'blue' },
    { status: 'POST_DISCHARGE_MONITORING', title: 'Наблюдение', note: 'После выписки', icon: 'home' as const, tone: 'teal' },
    { status: 'STABLE', title: 'Стабильное состояние', note: 'Текущий статус двойника', icon: 'check' as const, tone: 'green' },
  ]

  return (
    <div className="care-dashboard">
      <header className="overview-header">
        <div>
          <p className="overview-eyebrow"><span className="overview-brand-cross" aria-hidden>+</span> CareTwin AI <span>/</span> Рабочее пространство</p>
          <h1>{nurse ? 'Мои пациенты и задачи' : 'Обзор наблюдения'}</h1>
          <p className="overview-subtitle">Состояние пациентов, приоритеты и следующий шаг — в одном месте.</p>
        </div>
        <div className="overview-identity"><span className="overview-identity__date">{today}</span><strong>{organization}</strong><span>{roleName}</span></div>
      </header>

      <div id="overview-assistant" className="overview-assistant-area">
        {assistant}
      </div>

      <section className="overview-welcome" aria-label="Быстрый старт">
        <div className="overview-welcome__copy">
          <span className="overview-kicker">НЕПРЕРЫВНАЯ ЗАБОТА</span>
          <h2>От лечения — к наблюдению дома</h2>
          <p>Откройте цифрового двойника, чтобы увидеть весь путь пациента и вовремя заметить изменения.</p>
          <div className="overview-actions">
            {nurse
              ? <a className="overview-button overview-button--primary" href="#overview-follow-up">Мои пациенты <DashboardIcon name="arrow" /></a>
              : <Link className="overview-button overview-button--primary" to="/patients">Открыть пациентов <DashboardIcon name="arrow" /></Link>}
            <button className="overview-button overview-button--quiet" type="button" onClick={() => setShowGuide(value => !value)} aria-expanded={showGuide} aria-controls="overview-guide">{showGuide ? 'Скрыть подсказки' : 'Как работать с панелью'}</button>
          </div>
        </div>
        <div className="overview-journey-art" aria-hidden="true">
          <div className="overview-orbit" />
          <div className="overview-art-node overview-art-node--hospital"><DashboardIcon name="hospital" /><span>Стационар</span></div>
          <div className="overview-art-heart"><DashboardIcon name="pulse" /></div>
          <div className="overview-art-node overview-art-node--home"><DashboardIcon name="home" /><span>Дома</span></div>
          <span className="overview-art-caption">Один пациент. Единая история.</span>
        </div>
      </section>

      {showGuide && <section id="overview-guide" className="overview-guide" aria-label="Как работать с панелью">{steps.map(([title, description], index) => <div key={title}><span className="overview-step-number">0{index + 1}</span><h3>{title}</h3><p>{description}</p></div>)}</section>}

      {patientError && <p role="alert" className="overview-error">Не удалось загрузить пациентов: {patientError}</p>}
      <ContinuityStrip patients={patients} loading={loading} unavailable={Boolean(patientError)} />
      <div className="overview-urgent">{alerts}</div>

      <div className="overview-workspace">
        <div className="overview-priority">
          <AttentionList patients={patients} events={events} loading={loading || eventsLoading} error={patientError || eventsError} />
          <div className="overview-follow-up" id="overview-follow-up">{followUp}</div>
        </div>
        <aside className="overview-side" aria-label="Этапы наблюдения и AI-сводка">
          <section className="overview-care-path">
            <div className="overview-section-heading"><div><span className="overview-kicker">ПУТЬ ПАЦИЕНТА</span><h2>Забота на каждом этапе</h2></div><DashboardIcon name="pulse" /></div>
            <p className="overview-section-description">Распределение пациентов по текущему статусу.</p>
            <ol>{stages.map(stage => <li key={stage.status} data-tone={stage.tone}><span className="overview-icon"><DashboardIcon name={stage.icon} /></span><span><strong>{stage.title}</strong><small>{stage.note}</small></span><b className="tabular">{loading || patientError ? '—' : patients.filter(patient => patient.digital_twins?.[0]?.current_status === stage.status).length}</b></li>)}</ol>
            <p className="overview-path-note">Без обновлений более 48 часов среди наблюдаемых дома: <strong>{loading || patientError ? '—' : silent}</strong>. Неактивные пациенты и записи без статуса не включены в этапы.</p>
          </section>
          <div className="overview-ai-summary">{summary}</div>
          <a className="overview-assistant-link" href="#overview-assistant"><DashboardIcon name="spark" /><span><strong>Нужен контекст по пациенту?</strong><small>Задайте вопрос AI-помощнику</small></span><DashboardIcon name="arrow" /></a>
        </aside>
      </div>


    </div>
  )
}
