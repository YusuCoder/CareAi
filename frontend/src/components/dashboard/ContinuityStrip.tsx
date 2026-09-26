import { DashboardIcon } from './DashboardIcon'
import type { DashboardIconName } from './DashboardIcon'
import type { PatientWithTwin } from '../../lib/queries'

interface Props {
  patients: PatientWithTwin[]
  loading: boolean
  unavailable?: boolean
}

export const ContinuityStrip: React.FC<Props> = ({ patients, loading, unavailable = false }) => {
  const cells: { label: string; value: number; note: string; icon: DashboardIconName; tone: string }[] = [
    { label: 'Пациенты', value: patients.length, note: 'В доступном вам списке', icon: 'patients', tone: 'violet' },
    { label: 'В стационаре', value: patients.filter(p => p.digital_twins?.[0]?.current_status === 'HOSPITALIZED').length, note: 'Продолжают лечение', icon: 'hospital', tone: 'blue' },
    { label: 'Под наблюдением дома', value: patients.filter(p => p.digital_twins?.[0]?.current_status === 'POST_DISCHARGE_MONITORING').length, note: 'Сопровождение после выписки', icon: 'home', tone: 'teal' },
    { label: 'Высокий риск', value: patients.filter(p => ['HIGH', 'CRITICAL'].includes(p.digital_twins?.[0]?.risk_level ?? '')).length, note: 'Высокий или критический уровень', icon: 'pulse', tone: 'rose' },
  ]

  return (
    <section className="overview-metrics" aria-label="Обзор пациентов" aria-busy={loading}>
      {cells.map(cell => (
        <div className="overview-metric" data-tone={cell.tone} key={cell.label}>
          <div className="overview-metric__top"><span>{cell.label}</span><span className="overview-icon"><DashboardIcon name={cell.icon} /></span></div>
          <p className="overview-metric__number tabular">{loading || unavailable ? '—' : cell.value}</p>
          <p className="overview-metric__note">{unavailable ? 'Данные недоступны' : loading ? 'Загружаем данные…' : cell.note}</p>
        </div>
      ))}
    </section>
  )
}
