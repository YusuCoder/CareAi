-- значения enum отдельной миграцией: добавленное значение нельзя использовать
-- в той же транзакции, где оно создано.

alter type public.twin_event_type add value if not exists 'VISIT_SCHEDULED';
alter type public.twin_event_type add value if not exists 'VISIT_COMPLETED';
alter type public.twin_event_type add value if not exists 'VISIT_MISSED';
alter type public.twin_event_type add value if not exists 'CARE_PLAN_COMPLETED';
