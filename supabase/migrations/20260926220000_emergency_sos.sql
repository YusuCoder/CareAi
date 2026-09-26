-- SOS: пациент нажимает «🆘 Мне плохо» в Telegram.
--
-- это не оценка риска, а прямой вызов: тревога EMERGENCY уровня CRITICAL сразу
-- уходит ответственной медсестре (Realtime), вместе с геолокацией, если пациент
-- ею поделился. медсестра отвечает, когда будет на месте, — бот сообщает это
-- пациенту. повторные нажатия в течение 30 минут не плодят тревоги, а обновляют
-- геолокацию в уже открытой.

alter table public.alerts
  add column if not exists latitude            numeric(9, 6) check (latitude between -90 and 90),
  add column if not exists longitude           numeric(9, 6) check (longitude between -180 and 180),
  add column if not exists location_accuracy_m numeric check (location_accuracy_m is null or location_accuracy_m >= 0),
  add column if not exists location_at         timestamptz,
  add column if not exists live_location_until timestamptz,
  add column if not exists visit_eta           timestamptz;

alter table public.alerts
  add constraint alerts_location_pair check ((latitude is null) = (longitude is null));

comment on column public.alerts.latitude is 'Геолокация пациента из Telegram (только для EMERGENCY).';
comment on column public.alerts.live_location_until is 'До какого момента Telegram присылает обновления трансляции геопозиции.';
comment on column public.alerts.visit_eta is 'Когда медсестра планирует быть у пациента. Бот сообщает это пациенту.';

create index if not exists alerts_open_emergency_idx
  on public.alerts (patient_id, created_at desc)
  where kind = 'EMERGENCY' and status <> 'RESOLVED';

-- медсестра отвечает временем прибытия
grant update (visit_eta) on table public.alerts to authenticated;


create or replace function public.raise_emergency(
  p_telegram_id bigint,
  p_latitude    numeric default null,
  p_longitude   numeric default null,
  p_accuracy    numeric default null,
  p_live_until  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
  v_first   text;
  v_alert   public.alerts;
  v_user    uuid;
  v_org     uuid;
  v_has_loc boolean := p_latitude is not null and p_longitude is not null
                       and p_latitude between -90 and 90 and p_longitude between -180 and 180;
begin
  select p.id, p.first_name into v_patient, v_first
    from public.patients p
   where p.telegram_id = p_telegram_id and p.is_active;

  if v_patient is null then return jsonb_build_object('status', 'NOT_LINKED'); end if;

  select a.* into v_alert
    from public.alerts a
   where a.patient_id = v_patient
     and a.kind = 'EMERGENCY'
     and a.status <> 'RESOLVED'
     and a.created_at > now() - interval '30 minutes'
   order by a.created_at desc
   limit 1
   for update;

  if found then
    if v_has_loc then
      update public.alerts
         set latitude = p_latitude, longitude = p_longitude,
             location_accuracy_m = p_accuracy, location_at = now(),
             live_location_until = coalesce(p_live_until, live_location_until)
       where id = v_alert.id;
    end if;

    return jsonb_build_object(
      'status', 'OK', 'created', false, 'alert_id', v_alert.id,
      'created_at', v_alert.created_at, 'first_name', v_first,
      'has_location', v_has_loc or v_alert.latitude is not null);
  end if;

  select r.user_id, r.organization_id into v_user, v_org from private.alert_recipient(v_patient) r;
  if v_org is null then
    select p.primary_clinic_id into v_org from public.patients p where p.id = v_patient;
  end if;

  insert into public.alerts (
    patient_id, organization_id, assigned_user_id, kind, level, title, reasons,
    latitude, longitude, location_accuracy_m, location_at, live_location_until)
  values (
    v_patient, v_org, v_user, 'EMERGENCY', 'CRITICAL',
    'SOS: пациент просит срочной помощи',
    jsonb_build_array(jsonb_build_object(
      'code', 'PATIENT_SOS', 'level', 'HIGH', 'label', 'Сигнал SOS',
      'detail', 'Пациент нажал «Мне плохо» в Telegram'
                || case when v_has_loc then ' · геолокация получена' else ' · без геолокации' end,
      'source_table', null, 'source_id', null, 'recorded_at', now())),
    case when v_has_loc then p_latitude end,
    case when v_has_loc then p_longitude end,
    case when v_has_loc then p_accuracy end,
    case when v_has_loc then now() end,
    p_live_until)
  returning * into v_alert;

  return jsonb_build_object(
    'status', 'OK', 'created', true, 'alert_id', v_alert.id,
    'created_at', v_alert.created_at, 'first_name', v_first, 'has_location', v_has_loc);
end;
$$;

comment on function public.raise_emergency(bigint, numeric, numeric, numeric, timestamptz) is
  'SOS из Telegram: создаёт тревогу EMERGENCY или обновляет геолокацию в открытой за последние 30 минут.';


-- трансляция геопозиции: Telegram присылает правки того же сообщения
create or replace function public.update_emergency_location(
  p_telegram_id bigint, p_latitude numeric, p_longitude numeric, p_accuracy numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    return jsonb_build_object('status', 'BAD_LOCATION');
  end if;

  update public.alerts a
     set latitude = p_latitude, longitude = p_longitude,
         location_accuracy_m = p_accuracy, location_at = now()
    from public.patients p
   where p.id = a.patient_id
     and p.telegram_id = p_telegram_id
     and a.kind = 'EMERGENCY'
     and a.status <> 'RESOLVED'
     and a.live_location_until > now();

  return jsonb_build_object('status', case when found then 'OK' else 'NO_EMERGENCY' end);
end;
$$;


-- вызов бота из базы: pg_net → telegram-bot, подписано секретом из Vault ------

create or replace function private.call_bot(p_task text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'caretwin_functions_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'caretwin_cron_secret';
  if v_url is null or v_secret is null then return null; end if;

  return net.http_post(
    url     := rtrim(v_url, '/') || '/telegram-bot?task=' || p_task,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 15000);
end;
$$;

create or replace function private.dispatch_check_ins()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select private.call_bot('dispatch');
$$;


-- медсестра взяла SOS в работу или назвала время — пациент узнаёт об этом в Telegram.
-- pg_net отправляет запрос только после фиксации транзакции.
create or replace function public.alerts_notify_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
begin
  if new.kind <> 'EMERGENCY' then return null; end if;

  if new.visit_eta is not null and new.visit_eta is distinct from old.visit_eta then
    v_event := 'ETA';
    perform public.log_twin_event(
      new.patient_id, 'NOTE_ADDED', 'HOME',
      'SOS: визит к ' || to_char(new.visit_eta at time zone 'Asia/Tashkent', 'HH24:MI'),
      now(), null, 'WARNING', 'alerts', new.id, (select auth.uid()), new.organization_id,
      jsonb_build_object('visit_eta', new.visit_eta));
  elsif new.status = 'ACKNOWLEDGED' and old.status = 'OPEN' then
    v_event := 'ACKNOWLEDGED';
  elsif new.status = 'RESOLVED' and old.status is distinct from 'RESOLVED' then
    v_event := 'RESOLVED';
  end if;

  if v_event is not null then
    perform private.call_bot('notify', jsonb_build_object('alert_id', new.id, 'event', v_event));
  end if;
  return null;
end;
$$;

drop trigger if exists alerts_notify_patient on public.alerts;
create trigger alerts_notify_patient
  after update on public.alerts
  for each row execute function public.alerts_notify_patient();


-- данные для сообщения пациенту; бот читает их по id тревоги
create or replace function public.emergency_notification(p_alert_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'telegram_id', p.telegram_id,
           'first_name', p.first_name,
           'status', a.status,
           'visit_eta', a.visit_eta)
    from public.alerts a
    join public.patients p on p.id = a.patient_id
   where a.id = p_alert_id and a.kind = 'EMERGENCY';
$$;


revoke execute on function
  public.raise_emergency(bigint, numeric, numeric, numeric, timestamptz),
  public.update_emergency_location(bigint, numeric, numeric, numeric),
  public.emergency_notification(uuid),
  public.alerts_notify_patient(),
  private.call_bot(text, jsonb),
  private.dispatch_check_ins()
from public, anon, authenticated;
