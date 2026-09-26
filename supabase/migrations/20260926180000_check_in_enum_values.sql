-- значения enum для самоконтроля через Telegram и движка риска.
-- отдельным файлом: добавленное значение нельзя использовать в той же транзакции.

-- ответы пациента, у которых раньше не было своего типа наблюдения
alter type public.observation_type add value if not exists 'WELLBEING_TREND';      -- лучше / так же / хуже, чем вчера
alter type public.observation_type add value if not exists 'NEW_SYMPTOMS';         -- новые или усилившиеся симптомы
alter type public.observation_type add value if not exists 'MEDICATION_ADHERENCE'; -- принял ли назначенные препараты

alter type public.twin_event_type add value if not exists 'MISSED_CHECK_IN';
alter type public.twin_event_type add value if not exists 'TELEGRAM_LINKED';
