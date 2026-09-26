-- SOS пациента из Telegram. Значение enum — отдельной миграцией: его нельзя
-- использовать в той же транзакции, где оно добавлено.

alter type public.alert_kind add value if not exists 'EMERGENCY';
