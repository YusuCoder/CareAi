-- самоконтроль после выписки через Telegram.
--
-- бот — edge-функция telegram-bot без пользовательского JWT (service role), поэтому
-- всё, что он пишет, проходит через функции ниже: они сами находят пациента по
-- telegram_id, проверяют шаг опроса и диапазоны значений. таблицы напрямую бот
-- не трогает.
--
-- ответы пишутся в observations сразу, по одному (source = PATIENT, канал —
-- через check_in_id), чтобы незавершённый опрос не терялся. риск пересчитывается один раз
-- — при завершении опроса.

-- настройки -------------------------------------------------------------------

create table public.check_in_settings (
  id                    boolean primary key default true check (id),
  send_hour             smallint not null default 10 check (send_hour between 0 and 23),
  timezone              text not null default 'Asia/Tashkent',
  response_window_hours smallint not null default 6 check (response_window_hours between 1 and 24),
  updated_at            timestamptz not null default now()
);

comment on table public.check_in_settings is
  'Расписание самоконтроля: во сколько по местному времени бот пишет пациенту и сколько часов ждёт ответа.';

insert into public.check_in_settings (id) values (true) on conflict do nothing;

create trigger check_in_settings_set_updated_at
  before update on public.check_in_settings
  for each row execute function public.set_updated_at();

alter table public.check_in_settings enable row level security;
revoke all on table public.check_in_settings from anon;
revoke insert, delete, truncate on table public.check_in_settings from authenticated;
grant select, update on table public.check_in_settings to authenticated;

create policy "Authenticated users can read check-in settings"
  on public.check_in_settings for select to authenticated using (true);

create policy "Super admins can change check-in settings"
  on public.check_in_settings for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));


-- опросы ----------------------------------------------------------------------

create type public.check_in_status as enum ('IN_PROGRESS', 'COMPLETED', 'MISSED', 'CANCELLED');

create table public.patient_check_ins (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  channel       text not null default 'TELEGRAM' check (channel in ('TELEGRAM')),
  source        public.clinical_source not null default 'PATIENT',
  trigger       text not null default 'SCHEDULED' check (trigger in ('SCHEDULED', 'PATIENT')),
  status        public.check_in_status not null default 'IN_PROGRESS',
  current_step  text,
  answers       jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  due_at        timestamptz not null,
  completed_at  timestamptz,
  risk_level    public.risk_level,
  alert_id      uuid references public.alerts (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint patient_check_ins_due_after_start check (due_at > started_at),
  constraint patient_check_ins_completed_has_timestamp
    check (status <> 'COMPLETED' or completed_at is not null)
);

comment on table public.patient_check_ins is
  'Ежедневный опрос пациента в Telegram: состояние диалога, ответы и итоговый уровень риска.';
comment on column public.patient_check_ins.current_step is 'Вопрос, на который бот ждёт ответ.';

create unique index patient_check_ins_one_open_per_patient
  on public.patient_check_ins (patient_id) where status = 'IN_PROGRESS';
create index patient_check_ins_patient_idx on public.patient_check_ins (patient_id, started_at desc);
create index patient_check_ins_due_idx on public.patient_check_ins (due_at) where status = 'IN_PROGRESS';

create trigger patient_check_ins_set_updated_at
  before update on public.patient_check_ins
  for each row execute function public.set_updated_at();

alter table public.patient_check_ins enable row level security;
revoke all on table public.patient_check_ins from anon;
revoke insert, update, delete, truncate on table public.patient_check_ins from authenticated;
grant select on table public.patient_check_ins to authenticated;

create policy "Read accessible check-ins"
  on public.patient_check_ins for select to authenticated
  using ((select private.can_access_patient(patient_id)));


alter table public.observations
  add column if not exists check_in_id uuid references public.patient_check_ins (id) on delete set null;
create index if not exists observations_check_in_id_idx on public.observations (check_in_id);

alter table public.alerts
  add column if not exists check_in_id uuid references public.patient_check_ins (id) on delete set null;
create index if not exists alerts_check_in_id_idx on public.alerts (check_in_id);


-- коды привязки ---------------------------------------------------------------

create table public.telegram_link_codes (
  code        text primary key,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     bigint
);

comment on table public.telegram_link_codes is
  'Одноразовые коды для /start в боте. Выдаёт медработник на странице пациента.';

create index telegram_link_codes_patient_idx on public.telegram_link_codes (patient_id);

alter table public.telegram_link_codes enable row level security;
revoke all on table public.telegram_link_codes from anon, authenticated;


-- подписи ответов в хронологии ------------------------------------------------

create or replace function public.observation_label(
  p_type      public.observation_type,
  p_numeric   numeric,
  p_secondary numeric,
  p_boolean   boolean,
  p_text      text,
  p_unit      text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'WELLBEING_TREND' then
      'Самочувствие по сравнению со вчера: ' || case p_text
        when 'BETTER' then 'лучше' when 'SAME' then 'так же' when 'WORSE' then 'хуже'
        else coalesce(p_text, '—') end
    when p_type = 'SHORTNESS_OF_BREATH' and p_text in ('NONE', 'SAME', 'WORSE') then
      'Одышка: ' || case p_text when 'NONE' then 'нет' when 'SAME' then 'как вчера' else 'сильнее' end
    when p_type = 'NEW_SYMPTOMS' then
      'Новые симптомы: ' || case when p_boolean then 'да' else 'нет' end
    when p_type = 'MEDICATION_ADHERENCE' then
      'Лекарства приняты: ' || case when p_boolean then 'все' else 'не все' end
    when p_type = 'BLOOD_PRESSURE' then
      'Blood pressure ' || p_numeric::text || '/' || p_secondary::text || coalesce(' ' || p_unit, '')
    when p_numeric is not null then
      initcap(replace(p_type::text, '_', ' ')) || ' ' || p_numeric::text || coalesce(' ' || p_unit, '')
    when p_boolean is not null then
      initcap(replace(p_type::text, '_', ' ')) || ': ' || case when p_boolean then 'yes' else 'no' end
    else
      initcap(replace(p_type::text, '_', ' ')) || coalesce(': ' || p_text, '')
  end;
$$;


-- совпадает ли значение хоть с одним правилом риска: так бот ставит is_abnormal
create or replace function private.observation_flagged(
  p_type public.observation_type, p_numeric numeric, p_secondary numeric, p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.risk_rules r,
           lateral (select case r.value_field when 'SECONDARY' then p_secondary else p_numeric end as v) x
     where r.enabled
       and r.observation_type = p_type
       and (
         (r.kind = 'THRESHOLD' and x.v is not null and (
             (r.direction = 'ABOVE' and x.v >= least(coalesce(r.medium_value, r.high_value), coalesce(r.high_value, r.medium_value)))
          or (r.direction = 'BELOW' and x.v <= greatest(coalesce(r.medium_value, r.high_value), coalesce(r.high_value, r.medium_value)))))
         or (r.kind = 'ANSWER' and p_text = r.match_text)
       )
  );
$$;


-- сессия бота -----------------------------------------------------------------

create or replace function public.telegram_session(p_telegram_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'patient_id', p.id,
           'first_name', p.first_name,
           'check_in', (
             select jsonb_build_object('id', c.id, 'current_step', c.current_step,
                                       'answers', c.answers, 'due_at', c.due_at)
               from public.patient_check_ins c
              where c.patient_id = p.id and c.status = 'IN_PROGRESS'))
    from public.patients p
   where p.telegram_id = p_telegram_id
     and p.is_active;
$$;


create or replace function public.issue_telegram_link_code(p_patient_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.can_access_patient(p_patient_id)
     or not (private.is_clinician() or cardinality(private.patient_access_org_ids()) > 0) then
    raise exception 'No access to patient %', p_patient_id using errcode = '42501';
  end if;

  -- прежние неиспользованные коды больше не действуют
  update public.telegram_link_codes c
     set expires_at = now()
   where c.patient_id = p_patient_id and c.used_at is null and c.expires_at > now();

  v_code := 'CT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.telegram_link_codes (code, patient_id, created_by, expires_at)
  values (v_code, p_patient_id, (select auth.uid()), now() + interval '72 hours');

  return query select v_code, now() + interval '72 hours';
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
      jsonb_build_object('via', p_via));
  else
    select p.first_name into v_first from public.patients p where p.id = p_patient_id;
  end if;

  return jsonb_build_object('status', 'LINKED', 'patient_id', p_patient_id, 'first_name', v_first);
end;
$$;


create or replace function public.telegram_link_by_code(p_telegram_id bigint, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.telegram_link_codes;
  v_result jsonb;
begin
  select * into v_row
    from public.telegram_link_codes c
   where c.code = upper(btrim(p_code))
   for update;

  if not found then return jsonb_build_object('status', 'INVALID_CODE'); end if;
  if v_row.used_at is not null and v_row.used_by is distinct from p_telegram_id then
    return jsonb_build_object('status', 'INVALID_CODE');
  end if;
  if v_row.used_at is null and v_row.expires_at <= now() then
    return jsonb_build_object('status', 'EXPIRED');
  end if;

  v_result := private.link_telegram(v_row.patient_id, p_telegram_id, 'CODE');

  if v_result ->> 'status' = 'LINKED' and v_row.used_at is null then
    update public.telegram_link_codes set used_at = now(), used_by = p_telegram_id
     where code = v_row.code;
  end if;

  return v_result;
end;
$$;


-- номер из «Поделиться контактом». бот передаёт его, только если контакт
-- принадлежит самому отправителю (contact.user_id = from.id).
create or replace function public.telegram_link_by_phone(p_telegram_id bigint, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_ids    uuid[];
begin
  if length(v_digits) < 9 then return jsonb_build_object('status', 'NOT_FOUND'); end if;

  select array_agg(p.id) into v_ids
    from public.patients p
   where p.is_active
     and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_digits;

  if v_ids is null then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if array_length(v_ids, 1) > 1 then return jsonb_build_object('status', 'AMBIGUOUS'); end if;

  return private.link_telegram(v_ids[1], p_telegram_id, 'PHONE');
end;
$$;


create or replace function public.start_check_in(p_telegram_id bigint, p_trigger text default 'PATIENT')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient  uuid;
  v_first    text;
  v_row      public.patient_check_ins;
  v_window   smallint;
  v_created  boolean := false;
begin
  select p.id, p.first_name into v_patient, v_first
    from public.patients p
   where p.telegram_id = p_telegram_id and p.is_active;

  if v_patient is null then return jsonb_build_object('status', 'NOT_LINKED'); end if;

  select * into v_row from public.patient_check_ins c
   where c.patient_id = v_patient and c.status = 'IN_PROGRESS';

  if not found then
    select s.response_window_hours into v_window from public.check_in_settings s;
    insert into public.patient_check_ins (patient_id, trigger, current_step, due_at)
    values (v_patient, p_trigger, 'TEMPERATURE', now() + make_interval(hours => coalesce(v_window, 6)))
    returning * into v_row;
    v_created := true;
  end if;

  return jsonb_build_object('status', 'OK', 'created', v_created, 'check_in_id', v_row.id,
                            'current_step', v_row.current_step, 'first_name', v_first,
                            'patient_id', v_patient);
end;
$$;


-- кому пора писать: опрос создаётся здесь, бот только отправляет сообщение
create or replace function public.claim_due_check_ins()
returns table (check_in_id uuid, patient_id uuid, telegram_id bigint, first_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.check_in_settings;
begin
  select * into s from public.check_in_settings limit 1;
  if extract(hour from now() at time zone s.timezone) < s.send_hour then
    return;
  end if;

  return query
  with due as (
    select p.id, p.telegram_id, p.first_name
      from public.patients p
      join public.digital_twins dt on dt.patient_id = p.id
     where p.telegram_id is not null
       and p.is_active
       and dt.current_status = 'POST_DISCHARGE_MONITORING'
       and not exists (
         select 1 from public.patient_check_ins c
          where c.patient_id = p.id
            and (c.status = 'IN_PROGRESS'
                 or (c.started_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date))
  ),
  created as (
    insert into public.patient_check_ins (patient_id, trigger, current_step, due_at)
    select d.id, 'SCHEDULED', 'TEMPERATURE', now() + make_interval(hours => s.response_window_hours)
      from due d
    on conflict do nothing
    returning id, patient_check_ins.patient_id
  )
  select c.id, c.patient_id, d.telegram_id, d.first_name
    from created c join due d on d.id = c.patient_id;
end;
$$;


create or replace function public.save_check_in_answer(
  p_telegram_id bigint,
  p_step        text,
  p_answer      jsonb,
  p_next_step   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.patient_check_ins;
  v_plan   uuid;
  v_type   public.observation_type;
  v_num    numeric;
  v_sec    numeric;
  v_bool   boolean;
  v_text   text;
  v_note   text;
  v_unit   text;
  v_choice text := p_answer ->> 'choice';
  v_skip   boolean := coalesce((p_answer ->> 'skipped')::boolean, false);
begin
  select ci.* into c
    from public.patient_check_ins ci
    join public.patients p on p.id = ci.patient_id
   where p.telegram_id = p_telegram_id and ci.status = 'IN_PROGRESS'
   for update of ci;

  if not found then return jsonb_build_object('status', 'NO_CHECK_IN'); end if;
  -- старые кнопки из предыдущих сообщений игнорируем
  if c.current_step is distinct from p_step
     and not (c.current_step = 'SYMPTOMS_TEXT' and p_step = 'SYMPTOMS') then
    return jsonb_build_object('status', 'STALE_STEP', 'current_step', c.current_step);
  end if;

  if v_skip and p_step not in ('TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE') then
    raise exception 'Step % cannot be skipped', p_step using errcode = '22023';
  end if;

  if not v_skip then
    case p_step
      when 'TEMPERATURE' then
        v_type := 'TEMPERATURE'; v_num := (p_answer ->> 'value')::numeric; v_unit := '°C';
        if v_num is null or v_num not between 34 and 43 then raise exception 'Temperature out of range' using errcode = '22003'; end if;
      when 'SPO2' then
        v_type := 'SPO2'; v_num := (p_answer ->> 'value')::numeric; v_unit := '%';
        if v_num is null or v_num not between 50 and 100 then raise exception 'SpO2 out of range' using errcode = '22003'; end if;
      when 'HEART_RATE' then
        v_type := 'HEART_RATE'; v_num := (p_answer ->> 'value')::numeric; v_unit := 'уд/мин';
        if v_num is null or v_num not between 30 and 220 then raise exception 'Heart rate out of range' using errcode = '22003'; end if;
      when 'BLOOD_PRESSURE' then
        v_type := 'BLOOD_PRESSURE'; v_unit := 'мм рт. ст.';
        v_num := (p_answer ->> 'systolic')::numeric; v_sec := (p_answer ->> 'diastolic')::numeric;
        if v_num is null or v_sec is null or v_num not between 60 and 260
           or v_sec not between 30 and 160 or v_num <= v_sec then
          raise exception 'Blood pressure out of range' using errcode = '22003';
        end if;
      when 'WELLBEING' then
        v_type := 'WELLBEING_TREND'; v_text := v_choice;
        if coalesce(v_text, '') not in ('BETTER', 'SAME', 'WORSE') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_num := case v_text when 'BETTER' then 1 when 'SAME' then 0 else -1 end;
      when 'DYSPNEA' then
        v_type := 'SHORTNESS_OF_BREATH'; v_text := v_choice;
        if coalesce(v_text, '') not in ('NONE', 'SAME', 'WORSE') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_bool := v_text <> 'NONE';
      when 'SYMPTOMS' then
        v_type := 'NEW_SYMPTOMS'; v_text := v_choice;
        if coalesce(v_text, '') not in ('YES', 'NO') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_bool := v_text = 'YES';
        v_note := nullif(left(btrim(p_answer ->> 'text'), 500), '');
      when 'MEDICATIONS' then
        v_type := 'MEDICATION_ADHERENCE'; v_text := v_choice;
        if coalesce(v_text, '') not in ('YES', 'NO') then raise exception 'Bad choice' using errcode = '22023'; end if;
        v_bool := v_text = 'YES';
      else
        raise exception 'Unknown step %', p_step using errcode = '22023';
    end case;

    select cp.id into v_plan
      from public.care_plans cp
     where cp.patient_id = c.patient_id and cp.status = 'ACTIVE'
     order by cp.created_at desc
     limit 1;

    -- пересчёт риска — при завершении опроса, а не после каждого ответа
    perform set_config('caretwin.defer_risk', 'on', true);

    insert into public.observations (
      patient_id, care_plan_id, type, value_numeric, value_secondary, value_boolean,
      value_text, unit, is_abnormal, note, source, recorded_at, check_in_id)
    values (
      c.patient_id, v_plan, v_type, v_num, v_sec, v_bool, v_text, v_unit,
      private.observation_flagged(v_type, v_num, v_sec, v_text),
      v_note, 'PATIENT', now(), c.id);

    perform set_config('caretwin.defer_risk', '', true);
  end if;

  update public.patient_check_ins
     set answers      = answers || jsonb_build_object(p_step, p_answer),
         current_step = p_next_step
   where id = c.id;

  return jsonb_build_object('status', 'OK', 'current_step', p_next_step);
end;
$$;


-- «Да, есть симптомы» — ждём описание текстом
create or replace function public.set_check_in_step(p_telegram_id bigint, p_from text, p_to text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patient_check_ins ci
     set current_step = p_to
    from public.patients p
   where p.id = ci.patient_id
     and p.telegram_id = p_telegram_id
     and ci.status = 'IN_PROGRESS'
     and ci.current_step = p_from;

  return jsonb_build_object('status', case when found then 'OK' else 'STALE_STEP' end);
end;
$$;


create or replace function private.check_in_summary(p_answers jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(concat_ws(' · ',
    'Т ' || private.risk_num((p_answers -> 'TEMPERATURE' ->> 'value')::numeric) || ' °C',
    'SpO₂ ' || private.risk_num((p_answers -> 'SPO2' ->> 'value')::numeric) || '%',
    'пульс ' || private.risk_num((p_answers -> 'HEART_RATE' ->> 'value')::numeric),
    'АД ' || (p_answers -> 'BLOOD_PRESSURE' ->> 'systolic') || '/' || (p_answers -> 'BLOOD_PRESSURE' ->> 'diastolic'),
    'самочувствие: ' || case p_answers -> 'WELLBEING' ->> 'choice'
        when 'BETTER' then 'лучше' when 'SAME' then 'так же' when 'WORSE' then 'хуже' end,
    'одышка: ' || case p_answers -> 'DYSPNEA' ->> 'choice'
        when 'NONE' then 'нет' when 'SAME' then 'как вчера' when 'WORSE' then 'сильнее' end,
    'новые симптомы: ' || case p_answers -> 'SYMPTOMS' ->> 'choice'
        when 'YES' then coalesce('«' || left(p_answers -> 'SYMPTOMS' ->> 'text', 120) || '»', 'да')
        when 'NO' then 'нет' end,
    'лекарства: ' || case p_answers -> 'MEDICATIONS' ->> 'choice'
        when 'YES' then 'приняты' when 'NO' then 'не все' end
  ), '');
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

  v_risk := public.refresh_risk(c.patient_id, 'check_in');
  v_lvl  := (v_risk ->> 'level')::public.risk_level;

  update public.patient_check_ins
     set status = 'COMPLETED', completed_at = now(), current_step = null,
         risk_level = v_lvl, alert_id = (v_risk ->> 'alert_id')::uuid
   where id = c.id;

  if v_risk ->> 'alert_id' is not null then
    update public.alerts set check_in_id = c.id where id = (v_risk ->> 'alert_id')::uuid;
  end if;

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


-- опрос не завершён за окно ответа → событие и тревога медсестре
create or replace function public.mark_missed_check_ins()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       record;
  v_user  uuid;
  v_org   uuid;
  v_count integer := 0;
  v_title text;
begin
  for c in
    update public.patient_check_ins ci
       set status = 'MISSED', current_step = null
     where ci.status = 'IN_PROGRESS' and ci.due_at < now()
    returning ci.*
  loop
    v_count := v_count + 1;
    v_title := case when c.answers = '{}'::jsonb
                    then 'Пациент не ответил на опрос в Telegram'
                    else 'Опрос в Telegram не завершён' end;

    perform public.log_twin_event(
      c.patient_id, 'MISSED_CHECK_IN', 'HOME', v_title, c.due_at,
      'Отправлен ' || to_char(c.started_at at time zone 'Asia/Tashkent', 'DD.MM HH24:MI')
        || coalesce('; получено: ' || private.check_in_summary(c.answers), ''),
      'WARNING', 'patient_check_ins', c.id, null, null,
      jsonb_build_object('channel', 'TELEGRAM', 'answers', c.answers));

    if not exists (select 1 from public.alerts a
                    where a.patient_id = c.patient_id and a.kind = 'MISSED_CHECK_IN'
                      and a.status <> 'RESOLVED') then
      v_user := null; v_org := null;
      select r.user_id, r.organization_id into v_user, v_org from private.alert_recipient(c.patient_id) r;
      if v_org is null then
        select p.primary_clinic_id into v_org from public.patients p where p.id = c.patient_id;
      end if;

      insert into public.alerts (patient_id, organization_id, assigned_user_id, kind, level,
                                 title, reasons, check_in_id)
      values (c.patient_id, v_org, v_user, 'MISSED_CHECK_IN', 'MEDIUM', v_title,
              jsonb_build_array(jsonb_build_object(
                'code', 'MISSED_CHECK_IN', 'level', 'MEDIUM', 'label', 'Пропущен самоконтроль',
                'detail', v_title || ' (срок ' || to_char(c.due_at at time zone 'Asia/Tashkent', 'DD.MM HH24:MI') || ')',
                'source_table', 'patient_check_ins', 'source_id', c.id, 'recorded_at', c.due_at)),
              c.id);
    end if;

    -- частичные ответы тоже должны дойти до движка риска
    if c.answers <> '{}'::jsonb then
      perform public.refresh_risk(c.patient_id, 'missed_check_in');
    end if;
  end loop;

  return v_count;
end;
$$;


-- секрет, которым pg_cron подписывает вызов бота ------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'caretwin_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                                'caretwin_cron_secret',
                                'pg_cron → edge function telegram-bot');
  end if;
end;
$$;

create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from vault.decrypted_secrets s
                  where s.name = 'caretwin_cron_secret' and s.decrypted_secret = p_secret);
$$;


revoke execute on function
  private.observation_flagged(public.observation_type, numeric, numeric, text),
  private.link_telegram(uuid, bigint, text),
  private.check_in_summary(jsonb),
  public.telegram_session(bigint),
  public.telegram_link_by_code(bigint, text),
  public.telegram_link_by_phone(bigint, text),
  public.start_check_in(bigint, text),
  public.claim_due_check_ins(),
  public.save_check_in_answer(bigint, text, jsonb, text),
  public.set_check_in_step(bigint, text, text),
  public.complete_check_in(bigint),
  public.mark_missed_check_ins(),
  public.verify_cron_secret(text)
from public, anon, authenticated;

revoke execute on function public.issue_telegram_link_code(uuid) from public, anon;
grant execute on function public.issue_telegram_link_code(uuid) to authenticated;


-- расписание ------------------------------------------------------------------
-- адрес функций хранится в Vault (caretwin_functions_url), чтобы миграция не
-- зависела от проекта. пока его нет, рассылка молча пропускается.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_check_ins()
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
    url     := rtrim(v_url, '/') || '/telegram-bot?task=dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 15000);
end;
$$;

revoke execute on function private.dispatch_check_ins() from public, anon, authenticated;

select cron.schedule('caretwin-missed-check-ins', '*/10 * * * *', 'select public.mark_missed_check_ins()');
select cron.schedule('caretwin-dispatch-check-ins', '*/10 * * * *', 'select private.dispatch_check_ins()');
