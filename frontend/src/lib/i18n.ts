/**
 * Russian interface strings, in one place.
 *
 * Enum labels live here too: the database speaks in SCREAMING_SNAKE, and every
 * screen that shows a risk level or a twin status must translate it the same
 * way. Adding Uzbek later means adding a second object, not hunting through JSX.
 */
import type { MembershipRole, RiskLevel, TwinStatus, CarePhase } from './database.types'

/**
 * Russian plural agreement: 1 минута, 2 минуты, 5 минут.
 * Getting this wrong is immediately visible to a native reader.
 */
export function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export const roleLabel: Record<MembershipRole, string> = {
  SUPER_ADMIN: 'Суперадминистратор',
  ORGANIZATION_ADMIN: 'Администратор организации',
  HOSPITAL_DOCTOR: 'Врач стационара',
  POLYCLINIC_DOCTOR: 'Врач поликлиники',
  NURSE: 'Медсестра',
}

export const twinStatusLabel: Record<TwinStatus, string> = {
  NEW: 'Новый',
  HOSPITALIZED: 'В стационаре',
  POST_DISCHARGE_MONITORING: 'Наблюдение дома',
  STABLE: 'Стабильно',
  INACTIVE: 'Неактивен',
}

export const riskLabel: Record<RiskLevel, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  CRITICAL: 'Критический',
}

export const phaseLabel: Record<CarePhase, string> = {
  HOSPITAL: 'Стационар',
  HOME: 'Дом',
}

export const t = {
  brand: 'TwinCare',

  common: {
    loading: 'Загрузка…',
    noOrganization: 'Без организации',
    signOut: 'Выйти',
    dash: '—',
  },

  login: {
    claim: 'Выписка меняет место, где оказывают помощь, а не то, продолжается ли она.',
    support:
      'Одна запись сопровождает пациента из палаты домой, поэтому больница, поликлиника и медсестра видят одно и то же.',
    heading: 'Вход',
    lead: 'Войдите под учётной записью, которую выдала ваша организация.',
    email: 'Электронная почта',
    emailPlaceholder: 'name@clinic.uz',
    password: 'Пароль',
    submit: 'Войти',
    submitting: 'Выполняется вход…',
    noSelfRegistration:
      'Учётные записи создаёт администратор вашей организации. Если войти не удаётся, обратитесь к нему: самостоятельная регистрация не предусмотрена.',
    devOnly: 'Только для разработки.',
    devAccounts: 'Демо-доступы: doctor.demo, admin.demo, nurse.demo на twincare.test',
    errors: {
      invalidCredentials: 'Неверная почта или пароль.',
      notConfirmed: 'Учётная запись ещё не подтверждена. Обратитесь к администратору организации.',
      network: 'Нет связи с сервером. Проверьте подключение и попробуйте снова.',
      generic: 'Не удалось войти.',
    },
  },

  journey: {
    admitted: 'Госпитализация',
    admittedDetail: 'Центральная больница',
    surgery: 'Операция',
    discharged: 'Выписка',
    dischargedDetail: 'Наблюдение переходит в поликлинику',
    checkIn: 'Опрос дома',
    checkInDetail: '37,1 °C',
    deterioration: 'Температура растёт',
    deteriorationDetail: '38,2 °C — медсестра уведомлена',
    today: 'Сегодня',
  },

  guard: {
    deniedTitle: 'Раздел недоступен для вашей роли',
    deniedBody: 'Этот раздел открыт только для следующих ролей:',
  },

  home: {
    title: 'Проверка подключения',
    subtitle:
      'Всё, что показано ниже, получено через Row Level Security от имени вошедшего пользователя.',
    patientsHeading: 'Доступные вам пациенты',
    patientsEmpty:
      'Доступных пациентов нет. Это работа RLS, а не ошибка: у этой учётной записи нет ни госпитализаций, ни планов наблюдения, ни назначений.',
    eventsHeading: 'Последние события',
    eventsEmpty: 'Событий нет.',
    updated: 'обновлено',
  },
} as const

/** "58 лет", "21 год", "22 года" */
export function yearsLabel(age: number): string {
  return `${age} ${plural(age, ['год', 'года', 'лет'])}`
}
