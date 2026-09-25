import type {
  CarePhase, MembershipRole, ObservationType, RiskLevel, TwinStatus,
} from './database.types'

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
  brand: 'CareTwin AI',

  nav: {
    overview: 'Обзор',
    patients: 'Пациенты',
    admissions: 'Госпитализации',
    carePlans: 'Планы наблюдения',
    postDischarge: 'После выписки',
    incoming: 'Входящие',
    assignments: 'Назначения',
    myPatients: 'Мои пациенты',
    attention: 'Внимание',
    staff: 'Сотрудники',
    menu: 'Меню',
    expand: 'Развернуть меню',
    collapse: 'Свернуть меню',
    close: 'Закрыть',
  },

  patients: {
    title: 'Пациенты',
    subtitle: 'Пациенты, к которым у вас есть доступ.',
    search: 'Поиск по фамилии или номеру',
    empty: 'Пациентов нет.',
    notFound: 'Ничего не найдено.',
    number: '№',
    name: 'Пациент',
    status: 'Состояние',
    risk: 'Риск',
    updated: 'Обновлено',
  },

  incoming: {
    title: 'Входящие пациенты',
    subtitle: 'Выписанные пациенты, наблюдение за которыми передано вам.',
    empty: 'Новых случаев нет.',
    from: 'Откуда',
    plan: 'План наблюдения',
    assigned: 'Назначена',
    unassigned: 'Не назначена',
    open: 'Открыть случай',
  },

  myPatients: {
    title: 'Мои пациенты',
    subtitle: 'Пациенты, наблюдение за которыми поручено вам.',
    empty: 'Вам пока не назначен ни один пациент.',
    since: 'С',
  },

  attention: {
    title: 'Требует внимания',
    subtitle: 'Отклонения и изменения риска за последнее время.',
    empty: 'Ничего не требует внимания.',
    note: 'Это настроенные демонстрационные правила, а не клиническая рекомендация.',
  },

  ai: {
    title: 'Сводка за смену',
    generating: 'Формируется сводка…',
    generated: 'Сформировано',
    refresh: 'Обновить',
    sources: 'Источник: событий в записях —',
    unavailable: 'Сводка недоступна.',
    notConfigured:
      'Сводка пока не подключена. Разверните функцию twin-summary и задайте ключ OPENAI_API_KEY.',
    grounding: 'Сводка построена только по сохранённым записям. Это не клиническое заключение.',
  },

  overview: {
    inHospital: 'В стационаре',
    monitored: 'На наблюдении дома',
    needsAttention: 'Требуют внимания',
    silent: 'Без данных 2+ суток',
    continuity: 'Непрерывность наблюдения',
    attentionHeading: 'Кому нужно внимание',
    attentionEmpty: 'Сейчас никому не требуется внимание.',
    changed: 'Изменилось',
  },

  twin: {
    tabs: {
      now: 'Обзор AI',
      trends: 'Динамика',
      history: 'История',
      plan: 'План наблюдения',
      timeline: 'Хронология',
      devices: 'Устройства',
    },
    back: 'К пациентам',
    active: 'Активен',
    inactive: 'Неактивен',
    id: 'ID',
    noPhone: 'Телефон не указан',
    primaryClinic: 'Прикреплён к',
    noClinic: 'Клиника не указана',
    addRecord: 'Добавить запись',
    soon: 'скоро',
    addKinds: {
      observation: 'Наблюдение',
      diagnosis: 'Диагноз',
      lab: 'Результат анализа',
      medication: 'Назначение',
    },
    deterioration: 'Обнаружено ухудшение',
    riskNotAssessed: 'Риск не оценён',
    sinceDischarge: 'С момента выписки',
    sinceAdmission: 'С момента госпитализации',
    dayAfterSurgery: 'сутки после операции',
    dayAfterDischarge: 'сутки после выписки',
    dayInHospital: 'сутки в стационаре',
    notFound: 'Пациент не найден или недоступен.',
    inHospital: 'сутки в стационаре',
    afterDischarge: 'сутки после выписки',
    allergy: 'Аллергия',
    responsible: 'Наблюдает',
    noResponsible: 'Ответственный не назначен',
    updated: 'обновлено',
    noData: 'Данных пока нет.',
    sources: {
      HOSPITAL: 'стационар',
      POLYCLINIC: 'поликлиника',
      NURSE: 'медсестра',
      PATIENT: 'пациент',
      DEVICE: 'устройство',
      AI_DRAFT: 'черновик ИИ',
    },
    vitals: {
      TEMPERATURE: 'Температура',
      HEART_RATE: 'Пульс',
      BLOOD_PRESSURE: 'Давление',
      SPO2: 'Сатурация',
      RESPIRATORY_RATE: 'Частота дыхания',
      PAIN: 'Боль',
      WEIGHT: 'Вес',
      GLUCOSE: 'Глюкоза',
      RESTING_HEART_RATE: 'Пульс в покое',
      HRV: 'ВСР',
      RECOVERY_SCORE: 'Восстановление',
      SKIN_TEMPERATURE_DELTA: 'Температура кожи',
      SLEEP_DURATION: 'Сон',
      SLEEP_EFFICIENCY: 'Качество сна',
      STEPS: 'Шаги',
      NAUSEA: 'Тошнота',
      WEAKNESS: 'Слабость',
      DIZZINESS: 'Головокружение',
      WOUND_REDNESS: 'Покраснение раны',
      SHORTNESS_OF_BREATH: 'Одышка',
      SWELLING: 'Отёки',
    } satisfies Record<ObservationType, string>,
    search: 'Поиск пациента…',
    clinicalStatus: 'Текущее состояние',
    lastUpdate: 'Последнее обновление',
    dischargedAgo: 'Выписан',
    watchedAt: 'Наблюдение в',
    afterDischargeRisk: 'Обнаружено ухудшение после выписки',
    chart: {
      title: 'График динамики',
      days7: '7 дней',
      days14: '14 дней',
      days30: '30 дней',
      empty: 'Недостаточно данных для графика.',
    },
    diagnosesCard: 'Диагнозы и актуальные проблемы',
    medicationsCard: 'Текущие лекарства',
    all: 'Все',
    current: 'Текущая',
    chronicTag: 'Хроническое',
    activeTag: 'Текущий',
    ai: {
      brief: 'Краткое описание',
      keyChanges: 'Ключевые изменения после выписки',
      interpretation: 'AI интерпретация',
      riskEngine: 'Risk Engine',
      analysed: 'Проанализировано',
      records: 'медицинских записей',
      usedData: 'Использованные данные',
      viewSources: 'Посмотреть источники',
      observations: 'наблюдений',
      observationsNote: 'жизненные показатели',
      diagnoses: 'диагноза',
      diagnosesNote: 'включая хронические',
      medications: 'лекарственных препарата',
      medicationsNote: 'текущие и прошлые',
      hospitalizations: 'госпитализация',
      hospitalizationsNote: 'текущая',
      labs: 'Результаты лабораторий',
      procedures: 'Процедуры',
      entries: 'записи',
      factors: 'Основные факторы',
      recentSurgery: 'Недавняя операция',
      ask: 'Спросить CareTwin',
      askPlaceholder: 'Задайте вопрос о пациенте…',
      askSoon: 'Вопросы к записи появятся на следующем этапе.',
      prompts: [
        'Почему у пациента высокий риск?',
        'Что изменилось после выписки?',
        'Кратко о последней госпитализации',
        'Показать историю диабета',
      ],
    },
    keyInfo: 'Ключевая информация',
    aiSummary: 'Клиническая сводка ИИ',
    selfReported: 'со слов пациента',
    key: {
      primaryDiagnosis: 'Основной диагноз',
      chronic: 'Хронические',
      recentProcedure: 'Последняя процедура',
      discharged: 'Выписан',
      carePlan: 'План наблюдения',
      nurse: 'Ответственная медсестра',
      nextCheckIn: 'Следующий опрос',
      lastCheckIn: 'Последний ответ пациента',
      notScheduled: 'не запланирован',
      viaTelegram: 'через Telegram',
      resolved: 'разрешён',
    },
    trend: {
      worse: 'ухудшение',
      better: 'улучшение',
      flat: 'без изменений',
    },
  },

  closure: {
    title: 'Готовы к завершению',
    subtitle: 'Наблюдение можно закрыть. Решение принимает врач.',
    empty: 'Сейчас никого нельзя закрыть.',
    ready: 'Можно завершить',
    overdue: 'Срок плана истёк',
    silent: 'Нет ответов',
    stableDays: 'без отклонений',
    reports: 'ответов за неделю',
    finish: 'Завершить наблюдение',
    extend: 'Продлить на 7 дней',
    finishing: 'Завершаем…',
    note: 'Почему завершаем (необязательно)',
    confirmTitle: 'Завершить наблюдение?',
    confirmBody:
      'План будет закрыт, назначения сняты, пациент перейдёт в список завершённых. Это решение записывается на ваше имя.',
    cancel: 'Отмена',
    closedAt: 'Наблюдение завершено',
    filterActive: 'Активные',
    filterClosed: 'Завершённые',
    filterAll: 'Все',
  },

  pending: {
    title: 'Раздел в разработке',
    body: 'Этот раздел появится на следующем этапе. Данные для него уже есть в базе.',
  },

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

  story: {
    timeline: {
      admitted: 'Госпитализация',
      admittedDate: '20 сен — Центральная больница',
      surgery: 'Операция',
      surgeryDate: '21 сен',
      discharged: 'Выписка',
      dischargedDate: '24 сен',
      polyclinic: 'Поликлиника',
      polyclinicDetail: 'Наблюдение передано',
      home: 'Наблюдение дома',
      homeDetail: 'Пациент отвечает сам',
      risk: 'Обнаружен риск',
      riskDetail: 'Состояние ухудшается',
      notified: 'Медсестра уведомлена',
      notifiedDetail: 'Решение принимает врач',
    },
    carePlanCreated: 'План наблюдения создан',
    handoff: {
      label: 'Наблюдение передано',
      organization: 'Поликлиника №7',
      nurse: 'Медсестра: Дильноза А.',
      received: 'План наблюдения получен',
      twinAccess: 'Цифровой двойник доступен',
      from: 'Центральная больница',
      to: 'Поликлиника',
      note: 'Двойник не копируется. Доступ получает следующая команда.',
    },
    checkIn: {
      greeting: 'Доброе утро, Акмал.',
      question: 'Укажите вашу температуру.',
      answer: '38,2 °C',
      confirmed: 'Цифровой двойник обновлён',
    },
    monitoring: {
      label: 'Наблюдение',
      temperature: 'Температура',
      heartRate: 'Пульс',
      temperatureUnit: '°C',
      heartRateUnit: 'уд/мин',
    },
    risk: {
      label: 'Модуль оценки риска',
      low: 'Низкий',
      medium: 'Средний',
      high: 'Высокий',
      note: 'Настроенные правила, не прогноз',
    },
    alert: {
      label: 'Требуется внимание',
      temperature: 'Температура',
      heartRate: 'Пульс',
      pain: 'Боль',
      painValue: '8 из 10',
      notified: 'Медсестра уведомлена',
    },
    complete: {
      line1: 'Один пациент',
      line2: 'Один непрерывный цифровой двойник',
    },
  },

  guard: {
    deniedTitle: 'Раздел недоступен для вашей роли',
    deniedBody: 'Этот раздел открыт только для следующих ролей:',
  },

  home: {
    title: 'Обзор',
    subtitle: 'Что изменилось у ваших пациентов за последние сутки.',
    patientsHeading: 'Доступные вам пациенты',
    patientsEmpty:
      'Доступных пациентов нет. Это работа RLS, а не ошибка: у этой учётной записи нет ни госпитализаций, ни планов наблюдения, ни назначений.',
    eventsHeading: 'Последние события',
    eventsEmpty: 'Событий нет.',
    updated: 'обновлено',
  },
} as const

export function yearsLabel(age: number): string {
  return `${age} ${plural(age, ['год', 'года', 'лет'])}`
}
