-- HEIGHT используется в следующей миграции: новое значение enum недоступно до завершения транзакции.

alter type public.observation_type add value if not exists 'HEIGHT';
