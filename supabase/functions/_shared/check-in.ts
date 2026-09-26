// Вопросы ежедневного самоконтроля и проверка ответов.
// Чистые функции без обращений к сети: их использует telegram-bot, их же удобно тестировать.
// Диапазоны совпадают с проверками в public.save_check_in_answer — база проверяет повторно.

export type Step =
  | 'TEMPERATURE'
  | 'SPO2'
  | 'HEART_RATE'
  | 'BLOOD_PRESSURE'
  | 'WELLBEING'
  | 'DYSPNEA'
  | 'SYMPTOMS'
  | 'SYMPTOMS_TEXT'
  | 'MEDICATIONS'

export const ORDER: Step[] = [
  'TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
  'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS',
]

export interface Choice {
  value: string
  label: string
}

interface NumericQuestion {
  kind: 'number'
  prompt: string
  hint: string
  min: number
  max: number
  integer: boolean
}

interface PressureQuestion {
  kind: 'pressure'
  prompt: string
  hint: string
}

interface ChoiceQuestion {
  kind: 'choice'
  prompt: string
  choices: Choice[]
}

interface TextQuestion {
  kind: 'text'
  prompt: string
  skipLabel: string
}

export type Question = NumericQuestion | PressureQuestion | ChoiceQuestion | TextQuestion

export const SKIP_DEVICE = 'Нет прибора / пропустить'

export const QUESTIONS: Record<Step, Question> = {
  TEMPERATURE: {
    kind: 'number',
    prompt: 'Какая у вас сейчас температура тела, °C?',
    hint: 'Напишите число от 34 до 43, например 36,8.',
    min: 34, max: 43, integer: false,
  },
  SPO2: {
    kind: 'number',
    prompt: 'Сатурация (SpO₂) по пульсоксиметру, %?',
    hint: 'Напишите целое число от 50 до 100, например 97.',
    min: 50, max: 100, integer: true,
  },
  HEART_RATE: {
    kind: 'number',
    prompt: 'Пульс, ударов в минуту?',
    hint: 'Напишите целое число от 30 до 220, например 76.',
    min: 30, max: 220, integer: true,
  },
  BLOOD_PRESSURE: {
    kind: 'pressure',
    prompt: 'Артериальное давление?',
    hint: 'Напишите два числа через дробь, например 120/80.',
  },
  WELLBEING: {
    kind: 'choice',
    prompt: 'Как вы себя чувствуете по сравнению со вчерашним днём?',
    choices: [
      { value: 'BETTER', label: 'Лучше' },
      { value: 'SAME', label: 'Так же' },
      { value: 'WORSE', label: 'Хуже' },
    ],
  },
  DYSPNEA: {
    kind: 'choice',
    prompt: 'Есть ли одышка?',
    choices: [
      { value: 'NONE', label: 'Нет' },
      { value: 'SAME', label: 'Есть, как вчера' },
      { value: 'WORSE', label: 'Есть, сильнее' },
    ],
  },
  SYMPTOMS: {
    kind: 'choice',
    prompt: 'Появились ли новые симптомы или что-то ухудшилось?',
    choices: [
      { value: 'NO', label: 'Нет' },
      { value: 'YES', label: 'Да' },
    ],
  },
  SYMPTOMS_TEXT: {
    kind: 'text',
    prompt: 'Коротко опишите, что именно беспокоит.',
    skipLabel: 'Не описывать',
  },
  MEDICATIONS: {
    kind: 'choice',
    prompt: 'Вы приняли назначенные лекарства?',
    choices: [
      { value: 'YES', label: 'Да, все' },
      { value: 'NO', label: 'Не все / не принимал(а)' },
    ],
  },
}

/** «2/5. Сатурация…» — номер по вопросам этого опроса; уточнение без номера. */
export function promptOf(step: Step, steps: string[] = ORDER): string {
  const index = steps.indexOf(step)
  const prompt = QUESTIONS[step].prompt
  return index >= 0 ? `${index + 1}/${steps.length}. ${prompt}` : prompt
}

export function nextStep(step: Step): Step | null {
  const base: Step = step === 'SYMPTOMS_TEXT' ? 'SYMPTOMS' : step
  const index = ORDER.indexOf(base)
  return index >= 0 && index < ORDER.length - 1 ? ORDER[index + 1] : null
}

export function isStep(value: unknown): value is Step {
  return typeof value === 'string' && value in QUESTIONS
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** «36,8», «36.8», «36.8°», «t 36,8» → 36.8. Больше одного числа — ошибка, не угадываем. */
export function parseNumber(text: string, question: NumericQuestion): Parsed<number> {
  const numbers = text.replace(/sp\s*o\s*2/gi, '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g) ?? []
  if (numbers.length !== 1) {
    return { ok: false, error: `Не получилось распознать значение. ${question.hint}` }
  }
  const value = Number(numbers[0])
  if (!Number.isFinite(value) || value < question.min || value > question.max) {
    return { ok: false, error: `Значение ${numbers[0].replace('.', ',')} вне допустимого диапазона. ${question.hint}` }
  }
  if (question.integer && !Number.isInteger(value)) {
    return { ok: false, error: `Нужно целое число. ${question.hint}` }
  }
  return { ok: true, value }
}

/** «120/80», «120 80», «120-80», «120\80». */
export function parsePressure(text: string): Parsed<{ systolic: number; diastolic: number }> {
  const hint = QUESTIONS.BLOOD_PRESSURE.kind === 'pressure' ? QUESTIONS.BLOOD_PRESSURE.hint : ''
  const match = text.trim().match(/^(\d{2,3})\s*[/\\\-\s]\s*(\d{2,3})(?:\s*(?:мм.*|mm.*))?$/i)
  if (!match) return { ok: false, error: `Не получилось распознать давление. ${hint}` }

  const systolic = Number(match[1])
  const diastolic = Number(match[2])
  if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 160) {
    return { ok: false, error: `Значение ${systolic}/${diastolic} вне допустимого диапазона. ${hint}` }
  }
  if (systolic <= diastolic) {
    return { ok: false, error: `Первое число (верхнее давление) должно быть больше второго. ${hint}` }
  }
  return { ok: true, value: { systolic, diastolic } }
}

export function choiceLabel(step: Step, value: string): string | null {
  const question = QUESTIONS[step]
  if (question.kind !== 'choice') return null
  return question.choices.find((choice) => choice.value === value)?.label ?? null
}

// Формат callback_data: ci|<шаг>|<значение>. Лимит Telegram — 64 байта.
export function callbackData(step: Step, value: string): string {
  return `ci|${step}|${value}`
}

export function parseCallback(data: string | undefined): { step: Step; value: string } | null {
  const parts = (data ?? '').split('|')
  if (parts.length !== 3 || parts[0] !== 'ci' || !isStep(parts[1])) return null
  return { step: parts[1], value: parts[2] }
}

// Постоянная кнопка под полем ввода. request_location: телефон сам отправит геопозицию.
export const SOS_BUTTON = '🆘 Мне плохо — вызвать медсестру'

const tashkentTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })

export const MESSAGES = {
  greeting: (name: string) => `Добрый день, ${name}. Проверим ваше состояние.`,
  // Пациенту не сообщаем ни уровень риска, ни интерпретацию — только подтверждение.
  done:
    'Спасибо. Ваши данные сохранены и будут доступны медицинскому персоналу.\n\n' +
    'Если состояние резко ухудшится, не ждите звонка — вызывайте скорую помощь по номеру 103.',
  welcomeUnlinked:
    'Здравствуйте! Это бот CareTwin для наблюдения после выписки.\n\n' +
    'Чтобы подключиться, откройте ссылку, которую дал медработник, или отправьте код привязки ' +
    'сообщением. Можно также поделиться номером телефона — он должен совпадать с номером в карте.',
  linked: (name: string) =>
    `${name}, вы подключены. Каждый день бот будет задавать несколько вопросов о самочувствии. ` +
    'Пройти опрос вне расписания можно командой /checkin.\n\n' +
    'Если станет плохо — нажмите кнопку 🆘 внизу экрана.',
  invalidCode: 'Код не найден. Проверьте его или попросите медработника выдать новый.',
  expiredCode: 'Срок действия кода истёк. Попросите медработника выдать новый.',
  taken: 'Этот Telegram уже подключён к другой карте. Обратитесь в поликлинику.',
  phoneNotFound: 'Номер не найден в картах пациентов. Используйте код привязки от медработника.',
  phoneAmbiguous: 'Этот номер указан в нескольких картах. Используйте код привязки от медработника.',
  foreignContact: 'Поделитесь, пожалуйста, своим номером — кнопкой ниже, а не чужим контактом.',
  noCheckIn:
    'Сейчас опрос не проводится. Бот напишет в назначенное время. ' +
    'Пройти опрос сейчас — команда /checkin.',
  resume: 'Продолжим опрос с того места, где остановились.',
  help:
    '/sos — мне плохо, срочно вызвать медсестру\n' +
    '/checkin — пройти опрос о самочувствии сейчас\n' +
    '/help — эта справка\n\n' +
    'Бот не ставит диагноз и не заменяет врача. При резком ухудшении звоните 103.',
  sharePhone: 'Поделиться номером',
  sosPinned:
    '🆘 Если вам станет плохо, нажмите кнопку «Мне плохо — вызвать медсестру» внизу экрана ' +
    'или отправьте /sos. Медсестра сразу получит срочный сигнал и вашу геолокацию.\n\n' +
    'При угрозе жизни не ждите — звоните 103.',
  // Никакой оценки состояния: только что сигнал доставлен и что делать при угрозе жизни.
  sosSent: (withLocation: boolean) =>
    `🆘 Сигнал отправлен медсестре${withLocation ? ' вместе с вашей геолокацией' : ''}. ` +
    'Она свяжется с вами как можно скорее.\n\n' +
    'Если состояние угрожает жизни — не ждите, звоните 103.',
  sosAskLocation:
    'Чтобы медсестра знала, где вы, отправьте геолокацию: кнопка 🆘 внизу экрана ' +
    '(на телефоне) или 📎 → «Геопозиция».',
  sosRepeat: (createdAt: string, withLocation: boolean) =>
    `Сигнал уже передан медсестре в ${tashkentTime(createdAt)}.` +
    (withLocation ? ' Геолокация обновлена.' : '') +
    ' При угрозе жизни звоните 103.',
  notifyAcknowledged: '✅ Медсестра получила ваш сигнал и скоро свяжется с вами.',
  notifyEta: (eta: string) =>
    `🚑 Медсестра едет к вам. Ориентировочное время прибытия — ${tashkentTime(eta)}.\n` +
    'При угрозе жизни звоните 103.',
  notifyResolved: 'Медсестра закрыла вызов. Если вам снова станет хуже — нажмите 🆘.',
  error: 'Не удалось сохранить ответ. Попробуйте ещё раз чуть позже.',
}
