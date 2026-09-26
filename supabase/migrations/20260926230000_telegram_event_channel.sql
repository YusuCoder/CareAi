-- метка канала на событиях хронологии.
--
-- всё, что пришло из Telegram (ответы опроса, опрос целиком, пропуск, привязка,
-- тревоги и реакции медсестры на них), получает metadata.channel = 'TELEGRAM'.
-- по этой метке интерфейс показывает эти события медсестре на панели, а врачам —
-- только во вкладке «Telegram» карточки пациента, а не в общей ленте.

-- ответ опроса: наблюдение с check_in_id
create or replace function public.observations_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_twin_event(
    new.patient_id,
    'OBSERVATION_RECORDED',
    public.clinical_phase(new.source, new.hospitalization_id),
    public.observation_label(new.type, new.value_numeric, new.value_secondary,
                             new.value_boolean, new.value_text, new.unit),
    new.recorded_at,
    case when new.source = 'PATIENT' then 'Reported by the patient' else new.note end,
    case when new.is_abnormal then 'WARNING'::public.twin_event_severity
         else 'INFO'::public.twin_event_severity end,
    'observations',
    new.id,
    new.recorded_by,
    new.organization_id,
    jsonb_build_object(
      'type', new.type::text,
      'value', new.value_numeric,
      'value_secondary', new.value_secondary,
      'value_boolean', new.value_boolean,
      'unit', new.unit,
      'source', new.source::text
    ) || case when new.check_in_id is not null
              then jsonb_build_object('channel', 'TELEGRAM', 'check_in_id', new.check_in_id)
              else '{}'::jsonb end
  );
  return null;
end;
$$;


-- тревоги из Telegram: SOS, пропущенный опрос и риск по итогам опроса
create or replace function private.alert_channel(p_alert public.alerts)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_alert.kind in ('EMERGENCY', 'MISSED_CHECK_IN') or p_alert.check_in_id is not null
              then jsonb_build_object('channel', 'TELEGRAM')
              else '{}'::jsonb end;
$$;

create or replace function public.alerts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_twin_event(
      new.patient_id, 'ALERT_CREATED', 'HOME', new.title, new.created_at,
      (select string_agg(x ->> 'detail', '; ') from jsonb_array_elements(new.reasons) x),
      case when new.level in ('HIGH', 'CRITICAL') then 'CRITICAL'::public.twin_event_severity
           else 'WARNING'::public.twin_event_severity end,
      'alerts', new.id, null, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'level', new.level::text,
                         'assigned_user_id', new.assigned_user_id)
        || private.alert_channel(new));
  elsif new.status = 'RESOLVED' and old.status is distinct from 'RESOLVED' then
    perform public.log_twin_event(
      new.patient_id, 'ALERT_RESOLVED', 'HOME', 'Тревога закрыта: ' || new.title,
      coalesce(new.resolved_at, now()), new.resolution_note, 'INFO',
      'alerts', new.id, new.resolved_by, new.organization_id,
      jsonb_build_object('kind', new.kind::text, 'level', new.level::text)
        || private.alert_channel(new));
  end if;
  return null;
end;
$$;

-- риск по итогам опроса: complete_check_in передаёт id опроса через
-- caretwin.check_in_id, и тревога сразу создаётся с check_in_id — поэтому и
-- событие ALERT_CREATED получает метку канала.
create or replace function public.refresh_risk(p_patient_id uuid, p_trigger text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eval      jsonb;
  v_level     public.risk_level;
  v_previous  public.risk_level;
  v_status    public.twin_status;
  v_open      record;
  v_user      uuid;
  v_org       uuid;
  v_alert_id  uuid;
  v_check_in  uuid := nullif(current_setting('caretwin.check_in_id', true), '')::uuid;
begin
  v_eval  := public.evaluate_risk(p_patient_id);
  v_level := (v_eval ->> 'level')::public.risk_level;

  select dt.risk_level, dt.current_status into v_previous, v_status
    from public.digital_twins dt
   where dt.patient_id = p_patient_id
   for update;

  if not found then
    return v_eval || jsonb_build_object('alert_id', null);
  end if;

  update public.digital_twins
     set risk_level        = v_level,
         risk_reasons      = v_eval -> 'reasons',
         risk_evaluated_at = now()
   where patient_id = p_patient_id;

  if v_level in ('MEDIUM', 'HIGH') and v_status is distinct from 'HOSPITALIZED' then
    select a.id, a.level into v_open
      from public.alerts a
     where a.patient_id = p_patient_id
       and a.kind = 'RISK'
       and a.status <> 'RESOLVED'
     order by a.created_at desc
     limit 1;

    if v_open.id is null or private.risk_rank(v_level) > private.risk_rank(v_open.level) then
      select r.user_id, r.organization_id into v_user, v_org
        from private.alert_recipient(p_patient_id) r;

      if v_org is null then
        select p.primary_clinic_id into v_org from public.patients p where p.id = p_patient_id;
      end if;

      insert into public.alerts (patient_id, organization_id, assigned_user_id, kind, level, title, reasons, check_in_id)
      values (p_patient_id, v_org, v_user, 'RISK', v_level,
              case v_level when 'HIGH' then 'Высокий риск' else 'Средний риск' end
                || coalesce(': ' || (v_eval -> 'reasons' -> 0 ->> 'detail'), ''),
              v_eval -> 'reasons', v_check_in)
      returning id into v_alert_id;

      if v_open.id is not null then
        update public.alerts
           set status = 'RESOLVED', resolved_at = now(),
               resolution_note = 'Заменена тревогой более высокого уровня'
         where id = v_open.id;
      end if;
    end if;
  end if;

  return v_eval || jsonb_build_object('previous', v_previous, 'alert_id', v_alert_id,
                                      'trigger', p_trigger);
end;
$$;

create or replace function public.complete_check_in(p_telegram_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c      public.patient_check_ins;
  v_risk jsonb;
  v_lvl  public.risk_level;
begin
  select ci.* into c
    from public.patient_check_ins ci
    join public.patients p on p.id = ci.patient_id
   where p.telegram_id = p_telegram_id and ci.status = 'IN_PROGRESS'
   for update of ci;

  if not found then return jsonb_build_object('status', 'NO_CHECK_IN'); end if;

  perform set_config('caretwin.check_in_id', c.id::text, true);
  v_risk := public.refresh_risk(c.patient_id, 'check_in');
  perform set_config('caretwin.check_in_id', '', true);
  v_lvl  := (v_risk ->> 'level')::public.risk_level;

  update public.patient_check_ins
     set status = 'COMPLETED', completed_at = now(), current_step = null,
         risk_level = v_lvl, alert_id = (v_risk ->> 'alert_id')::uuid
   where id = c.id;

  perform public.log_twin_event(
    c.patient_id, 'PATIENT_CHECK_IN', 'HOME', 'Самоконтроль в Telegram',
    now(), private.check_in_summary(c.answers),
    case v_lvl when 'HIGH' then 'CRITICAL'::public.twin_event_severity
               when 'MEDIUM' then 'WARNING'::public.twin_event_severity
               else 'INFO'::public.twin_event_severity end,
    'patient_check_ins', c.id, null, null,
    jsonb_build_object('channel', 'TELEGRAM', 'source', 'PATIENT', 'answers', c.answers,
                       'risk_level', v_lvl, 'trigger', c.trigger));

  return jsonb_build_object('status', 'OK', 'check_in_id', c.id, 'patient_id', c.patient_id,
                            'risk_level', v_lvl, 'alert_id', v_risk -> 'alert_id',
                            'reasons', v_risk -> 'reasons');
end;
$$;


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
      jsonb_build_object('visit_eta', new.visit_eta, 'channel', 'TELEGRAM'));
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


create or replace function private.link_telegram(p_patient_id uuid, p_telegram_id bigint, p_via text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text;
begin
  if exists (select 1 from public.patients p
              where p.telegram_id = p_telegram_id and p.id <> p_patient_id) then
    return jsonb_build_object('status', 'TAKEN');
  end if;

  update public.patients p
     set telegram_id = p_telegram_id
   where p.id = p_patient_id
     and p.telegram_id is distinct from p_telegram_id
  returning p.first_name into v_first;

  if found then
    perform public.log_twin_event(
      p_patient_id, 'TELEGRAM_LINKED', 'HOME', 'Пациент подключил Telegram-бот',
      now(), case p_via when 'PHONE' then 'Подтверждён номером телефона' else 'По коду привязки' end,
      'INFO', 'patients', p_patient_id, null, null,
      jsonb_build_object('via', p_via, 'channel', 'TELEGRAM'));
  else
    select p.first_name into v_first from public.patients p where p.id = p_patient_id;
  end if;

  return jsonb_build_object('status', 'LINKED', 'patient_id', p_patient_id, 'first_name', v_first);
end;
$$;


revoke execute on function
  private.alert_channel(public.alerts),
  public.refresh_risk(uuid, text),
  public.complete_check_in(bigint)
from public, anon, authenticated;


-- уже записанные события из Telegram. хронология только дописывается, поэтому
-- запрет на изменение снимаем на время этой одноразовой разметки.
alter table public.twin_events disable trigger twin_events_no_update;

update public.twin_events e
   set metadata = e.metadata || jsonb_build_object('channel', 'TELEGRAM')
 where coalesce(e.metadata ->> 'channel', '') <> 'TELEGRAM'
   and (
     e.event_type in ('TELEGRAM_LINKED', 'PATIENT_CHECK_IN', 'MISSED_CHECK_IN')
     or (e.source_table = 'observations'
         and exists (select 1 from public.observations o where o.id = e.source_id and o.check_in_id is not null))
     or (e.source_table = 'alerts'
         and exists (select 1 from public.alerts a where a.id = e.source_id
                      and (a.kind in ('EMERGENCY', 'MISSED_CHECK_IN') or a.check_in_id is not null)))
   );

alter table public.twin_events enable trigger twin_events_no_update;

create index if not exists twin_events_channel_idx
  on public.twin_events ((metadata ->> 'channel'));
