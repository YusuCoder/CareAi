-- Новые значения enum используются только в следующей миграции, после завершения транзакции.

alter type public.observation_type add value if not exists 'HRV';
alter type public.observation_type add value if not exists 'RESTING_HEART_RATE';
alter type public.observation_type add value if not exists 'SKIN_TEMPERATURE_DELTA';
alter type public.observation_type add value if not exists 'SLEEP_DURATION';
alter type public.observation_type add value if not exists 'SLEEP_EFFICIENCY';
alter type public.observation_type add value if not exists 'STEPS';
alter type public.observation_type add value if not exists 'RECOVERY_SCORE';

alter type public.twin_event_type add value if not exists 'DEVICE_LINKED';
alter type public.twin_event_type add value if not exists 'DEVICE_UNLINKED';
