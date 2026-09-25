-- enum values for the wearable metrics.
-- has to be its own migration: postgres will not let you add an enum value and
-- use it in the same transaction, and supabase wraps each file in one.

alter type public.observation_type add value if not exists 'HRV';
alter type public.observation_type add value if not exists 'RESTING_HEART_RATE';
alter type public.observation_type add value if not exists 'SKIN_TEMPERATURE_DELTA';
alter type public.observation_type add value if not exists 'SLEEP_DURATION';
alter type public.observation_type add value if not exists 'SLEEP_EFFICIENCY';
alter type public.observation_type add value if not exists 'STEPS';
alter type public.observation_type add value if not exists 'RECOVERY_SCORE';

alter type public.twin_event_type add value if not exists 'DEVICE_LINKED';
alter type public.twin_event_type add value if not exists 'DEVICE_UNLINKED';
