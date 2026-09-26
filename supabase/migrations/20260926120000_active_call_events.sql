-- значения enum для активного вызова.
-- только значения: postgres не даёт добавить значение и использовать его в той
-- же транзакции, поэтому это отдельный файл.

alter type public.twin_event_type add value if not exists 'ACTIVE_CALL_CREATED';
alter type public.twin_event_type add value if not exists 'ACTIVE_CALL_ACKNOWLEDGED';
alter type public.twin_event_type add value if not exists 'ACTIVE_CALL_COMPLETED';
