-- Coronitas are symbolic recognition. They never affect availability, waiting
-- order, clinical priority, prices or access to care. Additive/idempotent upgrade.
begin;

create table if not exists public.reward_rules (
 key text primary key check(key in ('welcome','profile','confirmation','attendance')),
 label text not null,amount integer not null check(amount between 0 and 100),
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
insert into public.reward_rules(key,label,amount) values
 ('welcome','Bienvenida a Medicita',5),('profile','Perfil básico completado',3),
 ('confirmation','Confirmación de una atención',2),('attendance','Control realizado y validado',10)
on conflict(key) do nothing;
create index if not exists reward_rules_updated_by on public.reward_rules(updated_by);

create table if not exists public.care_processes (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),
 service_id uuid not null references public.services(id),created_at timestamptz not null default now()
);
alter table public.appointments add column if not exists care_process_id uuid;
insert into public.care_processes(id,patient_id,service_id,created_at)
 select distinct on(coalesce(a.care_process_id,a.id)) coalesce(a.care_process_id,a.id),a.patient_id,s.service_id,a.created_at
 from public.appointments a join public.slots s on s.id=a.slot_id
 order by coalesce(a.care_process_id,a.id),a.created_at
on conflict(id) do nothing;
update public.appointments set care_process_id=id where care_process_id is null;
alter table public.appointments alter column care_process_id set default gen_random_uuid();
alter table public.appointments alter column care_process_id set not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_care_process_fk') then
  alter table public.appointments add constraint appointments_care_process_fk foreign key(care_process_id) references public.care_processes(id);
 end if;
end$$;
create index if not exists appointments_care_process on public.appointments(care_process_id);
create index if not exists care_processes_patient on public.care_processes(patient_id);
create index if not exists care_processes_service on public.care_processes(service_id);

create table if not exists public.reward_ledger (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 action text not null check(action in ('welcome','profile','confirmation','attendance','attendance_correction','adjustment')),
 amount integer not null check(amount between -1000 and 1000),dedupe_key text not null,
 reason text not null check(length(reason) between 2 and 300),reference jsonb not null default '{}',
 actor_id uuid references public.profiles(id),reversal_of uuid references public.reward_ledger(id),
 created_at timestamptz not null default now(),unique(user_id,dedupe_key),unique(reversal_of)
);
create index if not exists reward_ledger_user_date on public.reward_ledger(user_id,created_at desc,id);
create index if not exists reward_ledger_actor on public.reward_ledger(actor_id);
create table if not exists public.reward_catalog (
 id text primary key,name text not null,description text not null,kind text not null check(kind in ('level','mission')),
 threshold integer,mission_key text,target integer not null default 1,sort_order integer not null,
 check((kind='level' and threshold is not null and threshold>=0 and mission_key is null) or(kind='mission' and threshold is null and mission_key is not null))
);
insert into public.reward_catalog(id,name,description,kind,threshold,mission_key,target,sort_order) values
 ('level-first','Primera corona','Tu primer reconocimiento en Medicita.','level',5,null,1,10),
 ('level-bronze','Corona de bronce','Reconocimiento simbólico desde 20 coronitas.','level',20,null,1,20),
 ('level-silver','Corona de plata','Reconocimiento simbólico desde 50 coronitas.','level',50,null,1,30),
 ('level-gold','Corona de oro','Reconocimiento simbólico desde 100 coronitas.','level',100,null,1,40),
 ('level-contigo','Corona Con Tigo','Reconocimiento simbólico desde 200 coronitas.','level',200,null,1,50),
 ('mission-welcome','Bienvenido a Medicita','Tu cuenta está registrada.','mission',null,'welcome',1,110),
 ('mission-profile','Mi perfil listo','Completaste los datos básicos necesarios.','mission',null,'profile',1,120),
 ('mission-confirmation','Yo confirmo','Confirmaste tu primera atención.','mission',null,'confirmation',1,130),
 ('mission-attendance-1','Mi primer control','Una atención fue realizada y validada.','mission',null,'attendance',1,140),
 ('mission-attendance-3','Tres pasos Con Tigo','Tres atenciones validadas, sin exigir periodicidad.','mission',null,'attendance',3,150),
 ('mission-attendance-5','Cinco controles Con Tigo','Cinco atenciones validadas, sin exigir visitas innecesarias.','mission',null,'attendance',5,160)
on conflict(id) do nothing;
create table if not exists public.user_reward_awards (
 user_id uuid not null references public.profiles(id),award_id text not null references public.reward_catalog(id),
 earned_at timestamptz not null default now(),active boolean not null default true,updated_at timestamptz not null default now(),
 primary key(user_id,award_id)
);
create table if not exists public.reward_award_events (
 id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id),
 award_id text not null references public.reward_catalog(id),event text not null check(event in ('earned','reactivated','corrected')),
 actor_id uuid references public.profiles(id),created_at timestamptz not null default now()
);
create index if not exists user_reward_awards_award on public.user_reward_awards(award_id);
create index if not exists reward_award_events_user on public.reward_award_events(user_id,created_at desc);
create index if not exists reward_award_events_actor on public.reward_award_events(actor_id);
create index if not exists reward_award_events_award on public.reward_award_events(award_id);
create table if not exists public.attendance_validations (
 care_process_id uuid primary key references public.care_processes(id),patient_id uuid not null references public.profiles(id),
 appointment_id uuid not null references public.appointments(id),active boolean not null default true,revision integer not null default 1 check(revision>0),
 reward_amount integer not null check(reward_amount between 0 and 100),credit_ledger_id uuid references public.reward_ledger(id),
 validated_at timestamptz not null,validated_by uuid references public.profiles(id),
 corrected_at timestamptz,corrected_by uuid references public.profiles(id),correction_reason text
);
create index if not exists attendance_validations_patient on public.attendance_validations(patient_id,active);
create index if not exists attendance_validations_appointment on public.attendance_validations(appointment_id);
create index if not exists attendance_validations_validated_by on public.attendance_validations(validated_by);
create index if not exists attendance_validations_corrected_by on public.attendance_validations(corrected_by);
create index if not exists attendance_validations_credit on public.attendance_validations(credit_ledger_id);
create table if not exists public.reward_community_profiles (
 user_id uuid primary key references public.profiles(id),opt_in boolean not null default false,
 alias text not null default '' check(length(alias)<=24),avatar text not null default 'contigo' check(avatar in ('heart','crown','leaf','sun','star','flower','contigo')),
 updated_at timestamptz not null default now()
);

create or replace function app_private.reward_lock(p_user uuid) returns void language sql set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,917413))
$$;
create or replace function app_private.reward_actor() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.profiles where id=auth.uid()
$$;
create or replace function app_private.reward_balance(p_user uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(amount),0)::bigint from public.reward_ledger where user_id=p_user
$$;
create or replace function app_private.reward_progress(p_user uuid,p_key text) returns integer language sql stable security definer set search_path='' as $$
 select case when p_key='attendance' then (select count(*)::integer from public.attendance_validations where patient_id=p_user and active)
 else (select count(*)::integer from public.reward_ledger where user_id=p_user and action=p_key) end
$$;
create or replace function app_private.reward_level(p_balance bigint) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('id',id,'name',name,'threshold',threshold) from public.reward_catalog where kind='level' and threshold<=p_balance order by threshold desc limit 1),jsonb_build_object('id','level-none','name','Por comenzar','threshold',0))
$$;
create or replace function app_private.reconcile_reward_awards(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.reward_catalog;v_eligible boolean;v_previous boolean;v_balance bigint;
begin
 perform app_private.reward_lock(p_user);v_balance:=app_private.reward_balance(p_user);
 for r in select * from public.reward_catalog order by sort_order loop
  v_eligible:=case when r.kind='level' then v_balance>=r.threshold else app_private.reward_progress(p_user,r.mission_key)>=r.target end;
  select active into v_previous from public.user_reward_awards where user_id=p_user and award_id=r.id;
  if not found then
   if v_eligible then
    insert into public.user_reward_awards(user_id,award_id) values(p_user,r.id) on conflict do nothing;
    insert into public.reward_award_events(user_id,award_id,event,actor_id) values(p_user,r.id,'earned',app_private.reward_actor());
   end if;
  elsif v_previous is distinct from v_eligible then
   update public.user_reward_awards set active=v_eligible,updated_at=now() where user_id=p_user and award_id=r.id;
   insert into public.reward_award_events(user_id,award_id,event,actor_id) values(p_user,r.id,case when v_eligible then 'reactivated' else 'corrected' end,app_private.reward_actor());
  end if;
 end loop;
end$$;
create or replace function app_private.credit_coronitas(p_user uuid,p_action text,p_amount integer,p_key text,p_reason text,p_reference jsonb default '{}',p_actor uuid default null,p_reversal uuid default null,p_at timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform app_private.reward_lock(p_user);
 insert into public.reward_ledger(user_id,action,amount,dedupe_key,reason,reference,actor_id,reversal_of,created_at)
 values(p_user,p_action,p_amount,p_key,left(p_reason,300),coalesce(p_reference,'{}'),p_actor,p_reversal,coalesce(p_at,now()))
 on conflict(user_id,dedupe_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.reward_ledger where user_id=p_user and dedupe_key=p_key;
 else perform app_private.reconcile_reward_awards(p_user);end if;
 return v_id;
end$$;
create or replace function app_private.reward_welcome(p_user uuid) returns void language plpgsql security definer set search_path='' as $$declare v_amount integer;begin
 select amount into strict v_amount from public.reward_rules where key='welcome';
 perform app_private.credit_coronitas(p_user,'welcome',v_amount,'welcome','Bienvenida: reconocimiento simbólico',jsonb_build_object('profile_id',p_user),null);
 insert into public.reward_community_profiles(user_id) values(p_user) on conflict do nothing;
end$$;
create or replace function app_private.reward_profile(p_user uuid) returns void language plpgsql security definer set search_path='' as $$declare v_amount integer;begin
 if exists(select 1 from public.profiles where id=p_user and onboarded and length(trim(full_name)) between 2 and 100) then
  select amount into strict v_amount from public.reward_rules where key='profile';
  perform app_private.credit_coronitas(p_user,'profile',v_amount,'profile','Datos básicos del perfil completados',jsonb_build_object('profile_id',p_user),app_private.reward_actor());
 end if;
end$$;
create or replace function app_private.reward_profile_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then perform app_private.reward_welcome(new.id);end if;
 perform app_private.reward_profile(new.id);return new;
end$$;
drop trigger if exists contigo_rewards_profile_insert on public.profiles;
create trigger contigo_rewards_profile_insert after insert on public.profiles for each row execute function app_private.reward_profile_trigger();
drop trigger if exists contigo_rewards_profile_update on public.profiles;
create trigger contigo_rewards_profile_update after update of full_name,onboarded on public.profiles for each row execute function app_private.reward_profile_trigger();

create or replace function app_private.prepare_care_process() returns trigger language plpgsql security definer set search_path='' as $$declare v_service uuid;v_process public.care_processes;begin
 select service_id into strict v_service from public.slots where id=new.slot_id;
 if new.care_process_id is null then new.care_process_id:=gen_random_uuid();end if;
 insert into public.care_processes(id,patient_id,service_id) values(new.care_process_id,new.patient_id,v_service) on conflict(id) do nothing;
 select * into strict v_process from public.care_processes where id=new.care_process_id;
 if v_process.patient_id<>new.patient_id or v_process.service_id<>v_service then raise exception 'El proceso de atención no corresponde a esta persona o prestación';end if;
 return new;
end$$;
drop trigger if exists contigo_prepare_care_process on public.appointments;
create trigger contigo_prepare_care_process before insert on public.appointments for each row execute function app_private.prepare_care_process();

-- The installed helper was inspected before this targeted replacement. All
-- availability, conflict, ownership, transaction and notification checks remain.
create or replace function app_private.place_booking(p_slot uuid,p_patient uuid,p_old uuid default null,p_confirm boolean default false,p_offer uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare s public.slots;old_a public.appointments;v_id uuid;v_process uuid;begin
 select * into s from public.slots where id=p_slot;
 if not found or s.starts_at<=now() then raise exception 'La hora ya no está disponible';end if;
 if not app_private.slot_enabled(s) then raise exception 'El cupo ya no coincide con la disponibilidad del profesional, box o prestación';end if;
 if exists(select 1 from public.appointments where slot_id=p_slot and status<>'cancelled') then raise exception 'Otra persona ya reservó este cupo';end if;
 if exists(select 1 from public.offers where slot_id=p_slot and status='pending' and expires_at>now() and id is distinct from p_offer) then raise exception 'El cupo tiene una oferta pendiente';end if;
 if p_old is not null then
  select * into old_a from public.appointments where id=p_old;
  if not found or old_a.patient_id<>p_patient or old_a.status not in ('reserved','confirmed') then raise exception 'Tu reserva anterior no permite este cambio';end if;
  if not exists(select 1 from public.slots os where os.id=old_a.slot_id and os.service_id=s.service_id and os.starts_at>now()+app_private.setting('cancellation_notice_minutes')*interval '1 minute') then raise exception 'No puedes cambiar esa reserva dentro del límite de cancelación';end if;
  v_process:=old_a.care_process_id;
 else v_process:=gen_random_uuid();end if;
 if app_private.patient_conflict(p_patient,s,p_old) then raise exception 'Ya tienes una reserva que coincide con este horario';end if;
 if p_old is not null then perform app_private.release_appointment(p_old,'Cambio de hora dentro de Medicita');end if;
 insert into public.appointments(slot_id,patient_id,status,confirmed_at,care_process_id) values(p_slot,p_patient,case when p_confirm then 'confirmed' else 'reserved' end,case when p_confirm then now() else null end,v_process) returning id into v_id;
 update public.cancellations set reassigned_at=now() where id=(select c.id from public.cancellations c where c.slot_id=p_slot and c.patient_id<>p_patient and c.reassigned_at is null order by c.released_at desc limit 1);
 delete from public.waiting where patient_id=p_patient and service_id=s.service_id;
 perform app_private.log_event(case when p_old is null then 'reserved' else 'rescheduled' end,p_slot,p_patient,v_id);
 perform app_private.notify(p_patient,case when p_old is null then 'reservation' else 'reschedule' end,case when p_confirm then 'Tu nueva hora está confirmada' else 'Tu hora está reservada' end,case when p_confirm then 'Revisa los detalles de tu atención en Medicita Contigo.' else 'Revisa tu reserva y confirma si podrás asistir. Reservar no registra asistencia.' end,v_id,null,'booking:'||v_id);
 return v_id;end$$;

create or replace function app_private.reward_confirmation(p_appointment uuid) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;s public.slots;v_amount integer;begin
 select * into strict a from public.appointments where id=p_appointment;select * into strict s from public.slots where id=a.slot_id;
 if a.status='confirmed' and a.confirmed_at is not null and a.confirmed_at<=now() and a.confirmed_at<s.starts_at and s.starts_at>now() then
  select amount into strict v_amount from public.reward_rules where key='confirmation';
  perform app_private.credit_coronitas(a.patient_id,'confirmation',v_amount,'confirmation:'||a.care_process_id,'Confirmación antes del inicio de la atención',jsonb_build_object('appointment_id',a.id,'care_process_id',a.care_process_id),app_private.reward_actor(),null,a.confirmed_at);
 end if;
end$$;
create or replace function app_private.reward_attendance(p_appointment uuid,p_actor uuid,p_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments;s public.slots;v public.attendance_validations;v_amount integer;v_revision integer;v_credit uuid;
begin
 select * into strict a from public.appointments where id=p_appointment;select * into strict s from public.slots where id=a.slot_id;
 if a.status<>'completed' or a.completed_at is null or a.arrived_at is null or p_at is null or p_at>now() or s.starts_at>p_at then return;end if;
 perform app_private.reward_lock(a.patient_id);
 select * into v from public.attendance_validations where care_process_id=a.care_process_id for update;
 if found and v.active then return;end if;
 if v.care_process_id is null then
  select amount into strict v_amount from public.reward_rules where key='attendance';v_revision:=1;
  insert into public.attendance_validations(care_process_id,patient_id,appointment_id,active,revision,reward_amount,validated_at,validated_by)
   values(a.care_process_id,a.patient_id,a.id,true,v_revision,v_amount,p_at,p_actor);
 else
  v_amount:=v.reward_amount;v_revision:=v.revision+1;
  update public.attendance_validations set active=true,revision=v_revision,appointment_id=a.id,validated_at=p_at,validated_by=p_actor where care_process_id=a.care_process_id;
 end if;
 v_credit:=app_private.credit_coronitas(a.patient_id,'attendance',v_amount,'attendance:'||a.care_process_id||':'||v_revision,'Atención realizada y validada por personal autorizado',jsonb_build_object('appointment_id',a.id,'care_process_id',a.care_process_id,'revision',v_revision),p_actor,null,p_at);
 update public.attendance_validations set credit_ledger_id=v_credit where care_process_id=a.care_process_id;
 perform app_private.reconcile_reward_awards(a.patient_id);
end$$;
create or replace function app_private.reward_appointment_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from new.status) and (auth.uid()=new.patient_id or app_private.actor_role() in ('admin','reception')) then perform app_private.reward_confirmation(new.id);end if;
 if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) and app_private.actor_role() in ('admin','reception')
 and exists(select 1 from public.checkin_events where appointment_id=new.id) then
  perform app_private.reward_attendance(new.id,app_private.reward_actor(),new.completed_at);
 end if;
 return new;
end$$;
drop trigger if exists contigo_reward_appointment on public.appointments;
create trigger contigo_reward_appointment after insert or update of status on public.appointments for each row execute function app_private.reward_appointment_trigger();

create or replace function app_private.immutable_reward_ledger() returns trigger language plpgsql set search_path='' as $$begin
 raise exception 'El historial de coronitas es inmutable; registra un ajuste o corrección auditados';
end$$;
drop trigger if exists contigo_reward_ledger_immutable on public.reward_ledger;
create trigger contigo_reward_ledger_immutable before update or delete on public.reward_ledger for each row execute function app_private.immutable_reward_ledger();

create or replace function public.get_reward_history(p_user uuid default null,p_offset integer default 0,p_limit integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid;v_total integer;v_items jsonb;
begin
 v_user:=coalesce(p_user,app_private.require_user());perform app_private.require_user();
 if v_user<>auth.uid() and app_private.actor_role()<>'admin' then raise exception 'Solo puedes consultar tu propio historial';end if;
 if not exists(select 1 from public.profiles where id=v_user) then raise exception 'No encontramos a esta persona';end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Paginación inválida';end if;
 select count(*) into v_total from public.reward_ledger where user_id=v_user;
 select coalesce(jsonb_agg(q.row order by q.created_at desc,q.id),'[]') into v_items from (
  select l.id,l.created_at,jsonb_build_object('id',l.id,'action',l.action,'amount',l.amount,'created_at',l.created_at,'reason',l.reason,'reference',l.reference,'appointment_id',l.reference->>'appointment_id','care_process_id',l.reference->>'care_process_id','reversal_of',l.reversal_of,
   'correctable',l.action='attendance' and exists(select 1 from public.attendance_validations a where a.credit_ledger_id=l.id and a.active)) as row
  from public.reward_ledger l where l.user_id=v_user order by l.created_at desc,l.id offset p_offset limit p_limit
 )q;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',p_offset,'limit',p_limit,'has_more',p_offset+p_limit<v_total);
end$$;
create or replace function app_private.reward_summary(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_balance bigint;v_level jsonb;v_next jsonb;v_awards jsonb;v_missions jsonb;v_rules jsonb;v_community jsonb;v_history jsonb;
begin
 v_balance:=app_private.reward_balance(p_user);v_level:=app_private.reward_level(v_balance);
 select jsonb_build_object('id',id,'name',name,'threshold',threshold) into v_next from public.reward_catalog where kind='level' and threshold>v_balance order by threshold limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'kind',c.kind,'threshold',c.threshold,'earned',a.earned_at is not null,'active',coalesce(a.active,false),'earned_at',a.earned_at) order by c.sort_order),'[]') into v_awards from public.reward_catalog c left join public.user_reward_awards a on a.award_id=c.id and a.user_id=p_user;
 select coalesce(jsonb_agg(jsonb_build_object('key',c.mission_key||case when c.mission_key='attendance' then '-'||c.target else '' end,'title',c.name,'progress',least(app_private.reward_progress(p_user,c.mission_key),c.target),'target',c.target,'completed',app_private.reward_progress(p_user,c.mission_key)>=c.target,'award_id',c.id) order by c.sort_order),'[]') into v_missions from public.reward_catalog c where c.kind='mission';
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',label,'amount',amount) order by case key when 'welcome' then 1 when 'profile' then 2 when 'confirmation' then 3 else 4 end),'[]') into v_rules from public.reward_rules;
 select jsonb_build_object('opt_in',opt_in,'alias',alias,'avatar',avatar) into v_community from public.reward_community_profiles where user_id=p_user;
 select coalesce(jsonb_agg(q.row order by q.created_at desc,q.id),'[]') into v_history from (
  select id,created_at,jsonb_build_object('id',id,'action',action,'amount',amount,'created_at',created_at,'reason',reason,'reference',reference,'appointment_id',reference->>'appointment_id','care_process_id',reference->>'care_process_id') as row
  from public.reward_ledger where user_id=p_user order by created_at desc,id limit 50
 )q;
 return jsonb_build_object('balance',v_balance,'level',v_level,'next_level',v_next,'progress',jsonb_build_object('current',greatest(v_balance,0),'target',coalesce((v_next->>'threshold')::integer,(v_level->>'threshold')::integer),'percent',case when v_next is null then 100 else greatest(0,least(100,round(100.0*v_balance/nullif((v_next->>'threshold')::integer,0)))) end),
  'rules',v_rules,'missions',v_missions,'awards',v_awards,'history',v_history,'validated_attendances',app_private.reward_progress(p_user,'attendance'),'community',coalesce(v_community,jsonb_build_object('opt_in',false,'alias','','avatar','contigo')),'symbolic',true);
end$$;
create or replace function public.get_my_rewards() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 return app_private.reward_summary(app_private.require_user());end$$;
create or replace function public.get_people_rewards(p_query text default '',p_level text default '',p_order text default 'crowns_desc',p_offset integer default 0,p_limit integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;v_total integer;
begin
 perform app_private.require_admin();
 if p_query is null or length(p_query)>100 or p_level is null or p_order is null or p_order not in ('crowns_desc','crowns_asc','name_asc') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Revisa los filtros de personas';end if;
 if p_level<>'' and not exists(select 1 from public.reward_catalog where id=p_level and kind='level') and p_level<>'level-none' then raise exception 'Nivel desconocido';end if;
 with totals as(select p.*,app_private.reward_balance(p.id) as balance,app_private.reward_level(app_private.reward_balance(p.id)) as level from public.profiles p where trim(p_query)='' or p.full_name||' '||p.last_name ilike '%'||trim(p_query)||'%')
 select count(*) into v_total from totals where p_level='' or level->>'id'=p_level;
 with totals as(select p.id,p.full_name,p.last_name,p.role,app_private.reward_balance(p.id) as balance,app_private.reward_level(app_private.reward_balance(p.id)) as level from public.profiles p where trim(p_query)='' or p.full_name||' '||p.last_name ilike '%'||trim(p_query)||'%'),
 page as(select * from totals where p_level='' or level->>'id'=p_level order by case when p_order='crowns_desc' then balance end desc,case when p_order='crowns_asc' then balance end asc,case when p_order='name_asc' then lower(full_name||' '||last_name) end,id offset p_offset limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'last_name',p.last_name,'role',p.role,'balance',p.balance,'level',p.level,'validated_attendances',app_private.reward_progress(p.id,'attendance'),'awards',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'active',a.active,'earned_at',a.earned_at) order by c.sort_order),'[]') from public.user_reward_awards a join public.reward_catalog c on c.id=a.award_id where a.user_id=p.id),'is_demo',false) order by case when p_order='crowns_desc' then p.balance end desc,case when p_order='crowns_asc' then p.balance end asc,case when p_order='name_asc' then lower(p.full_name||' '||p.last_name) end,p.id),'[]') into v_items from page p;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',p_offset,'limit',p_limit,'has_more',p_offset+p_limit<v_total);
end$$;
create or replace function public.get_reward_community(p_offset integer default 0,p_limit integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare v_items jsonb;v_total integer;begin
 perform app_private.require_user();
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Paginación inválida';end if;
 select count(*) into v_total from public.reward_community_profiles where opt_in;
 select coalesce(jsonb_agg(q.row order by q.balance desc,q.alias),'[]') into v_items from (
  select c.alias,app_private.reward_balance(c.user_id) as balance,jsonb_build_object('alias',c.alias,'avatar',c.avatar,'balance',app_private.reward_balance(c.user_id),'level',app_private.reward_level(app_private.reward_balance(c.user_id)),'is_self',c.user_id=auth.uid()) as row
  from public.reward_community_profiles c where c.opt_in order by app_private.reward_balance(c.user_id) desc,c.alias,c.user_id offset p_offset limit p_limit
 )q;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',p_offset,'limit',p_limit,'has_more',p_offset+p_limit<v_total);
end$$;
create or replace function public.save_community_preferences(p_opt_in boolean,p_alias text,p_avatar text) returns void language plpgsql security definer set search_path='' as $$declare v_user uuid;v_alias text:=trim(coalesce(p_alias,''));begin
 v_user:=app_private.require_user();
 if p_opt_in is null or p_avatar is null or p_avatar not in ('heart','crown','leaf','sun','star','flower','contigo') then raise exception 'Revisa tu preferencia y avatar';end if;
 if p_opt_in and (length(v_alias) not between 2 and 24 or v_alias !~ '^[[:alpha:][:digit:] _-]+$' or v_alias ~ '[[:digit:]]{6}' or v_alias ilike '%http%' or v_alias ilike '%www%') then raise exception 'Elige un alias de 2 a 24 caracteres, sin correo, teléfono ni enlaces';end if;
 if length(v_alias)>24 then raise exception 'El alias no puede superar 24 caracteres';end if;
 insert into public.reward_community_profiles(user_id,opt_in,alias,avatar) values(v_user,p_opt_in,case when p_opt_in then v_alias else '' end,p_avatar)
 on conflict(user_id) do update set opt_in=excluded.opt_in,alias=excluded.alias,avatar=excluded.avatar,updated_at=now();
 perform app_private.log_event('community_preference_updated',null,v_user,null,case when p_opt_in then 'Participación voluntaria activada con alias' else 'Participación voluntaria desactivada' end);
end$$;
create or replace function public.adjust_coronitas(p_user uuid,p_amount integer,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 perform app_private.require_admin();
 if p_user is null or not exists(select 1 from public.profiles where id=p_user) or p_amount is null or p_amount=0 or abs(p_amount)>1000 or p_reason is null or length(trim(p_reason)) not between 8 and 300 then raise exception 'Indica una persona, un ajuste de hasta 1000 coronitas y un motivo de 8 a 300 caracteres';end if;
 v_id:=app_private.credit_coronitas(p_user,'adjustment',p_amount,'adjustment:'||gen_random_uuid(),trim(p_reason),jsonb_build_object('administrative',true),auth.uid());
 perform app_private.log_event('coronitas_adjusted',null,p_user,null,left('Ajuste '||p_amount||': '||trim(p_reason),300));return v_id;
end$$;
create or replace function public.save_reward_rule(p_key text,p_amount integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform app_private.require_admin();
 if p_key is null or p_amount is null or p_amount not between 0 and 100 or p_reason is null or length(trim(p_reason)) not between 8 and 300 then raise exception 'Indica una regla, un valor de 0 a 100 y un motivo de 8 a 300 caracteres';end if;
 update public.reward_rules set amount=p_amount,updated_at=now(),updated_by=auth.uid() where key=p_key;
 if not found then raise exception 'La regla de recompensa no existe';end if;
 perform app_private.log_event('reward_rule_updated',null,null,null,left(p_key||' = '||p_amount||'. '||trim(p_reason),300));
end$$;
create or replace function public.correct_attendance(p_appointment uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments;v public.attendance_validations;v_revision integer;
begin
 perform app_private.require_staff();perform app_private.lock_schedule();
 if p_reason is null or length(trim(p_reason)) not between 8 and 300 then raise exception 'Explica la corrección con un motivo de 8 a 300 caracteres';end if;
 select * into a from public.appointments where id=p_appointment;
 if not found or a.status<>'completed' then raise exception 'Selecciona una atención completada con validación vigente';end if;
 perform app_private.reward_lock(a.patient_id);
 select * into v from public.attendance_validations where care_process_id=a.care_process_id for update;
 if not found or not v.active or v.appointment_id<>a.id then raise exception 'La asistencia ya está corregida o no tiene una validación vigente';end if;
 v_revision:=v.revision+1;
 update public.attendance_validations set active=false,revision=v_revision,corrected_at=now(),corrected_by=auth.uid(),correction_reason=trim(p_reason) where care_process_id=v.care_process_id;
 perform app_private.credit_coronitas(a.patient_id,'attendance_correction',-v.reward_amount,'attendance-correction:'||v.care_process_id||':'||v_revision,trim(p_reason),jsonb_build_object('appointment_id',a.id,'care_process_id',v.care_process_id,'revision',v_revision),auth.uid(),v.credit_ledger_id);
 update public.appointments set status='arrived',completed_at=null where id=a.id;
 perform app_private.log_event('attendance_corrected',a.slot_id,a.patient_id,a.id,trim(p_reason));
 perform app_private.reconcile_reward_awards(a.patient_id);
end$$;

-- Read-only RLS. All writes are private trigger/helpers or validated RPCs.
do $$declare t text;begin
 foreach t in array array['reward_rules','care_processes','reward_ledger','reward_catalog','user_reward_awards','reward_award_events','attendance_validations','reward_community_profiles'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end$$;
drop policy if exists reward_rules_read on public.reward_rules;
create policy reward_rules_read on public.reward_rules for select to authenticated using(true);
drop policy if exists reward_catalog_read on public.reward_catalog;
create policy reward_catalog_read on public.reward_catalog for select to authenticated using(true);
drop policy if exists care_processes_read on public.care_processes;
create policy care_processes_read on public.care_processes for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role())='admin');
drop policy if exists reward_ledger_read on public.reward_ledger;
create policy reward_ledger_read on public.reward_ledger for select to authenticated using(user_id=(select auth.uid()) or (select app_private.actor_role())='admin');
drop policy if exists user_reward_awards_read on public.user_reward_awards;
create policy user_reward_awards_read on public.user_reward_awards for select to authenticated using(user_id=(select auth.uid()) or (select app_private.actor_role())='admin');
drop policy if exists reward_award_events_read on public.reward_award_events;
create policy reward_award_events_read on public.reward_award_events for select to authenticated using(user_id=(select auth.uid()) or (select app_private.actor_role())='admin');
drop policy if exists attendance_validations_read on public.attendance_validations;
create policy attendance_validations_read on public.attendance_validations for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
drop policy if exists reward_community_profiles_read on public.reward_community_profiles;
create policy reward_community_profiles_read on public.reward_community_profiles for select to authenticated using(user_id=(select auth.uid()));

-- Migration/backfill policy: existing and new users receive welcome exactly
-- once; already-onboarded valid profiles receive their one profile award. A
-- currently valid, recorded confirmation can be credited once. Past completed
-- attendance is credited only with both an authorized legacy completion audit
-- event and a check-in record. No future attendance or cancelled event pays.
do $$declare p record;r record;begin
 for p in select id from public.profiles loop
  perform app_private.reward_welcome(p.id);perform app_private.reward_profile(p.id);
 end loop;
 for r in select a.id from public.appointments a join public.slots s on s.id=a.slot_id where a.status='confirmed' and a.confirmed_at is not null and a.confirmed_at<=now() and a.confirmed_at<s.starts_at and s.starts_at>now() loop
  perform app_private.reward_confirmation(r.id);
 end loop;
 for r in select a.id,a.completed_at,(select e.actor_id from public.appointment_events e where e.appointment_id=a.id and e.event='completed' and e.actor_id is not null order by e.created_at desc limit 1) as actor
  from public.appointments a join public.slots s on s.id=a.slot_id where a.status='completed' and a.completed_at is not null and a.arrived_at is not null and a.completed_at<=now() and s.starts_at<=a.completed_at and exists(select 1 from public.checkin_events c where c.appointment_id=a.id) and exists(select 1 from public.appointment_events e where e.appointment_id=a.id and e.event='completed' and e.actor_id is not null)
 loop perform app_private.reward_attendance(r.id,r.actor,r.completed_at);end loop;
end$$;

-- Restrict only functions introduced here; preserve existing helper/RPC ACLs.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_private' and p.proname=any(array['reward_lock','reward_actor','reward_balance','reward_progress','reward_level','reconcile_reward_awards','credit_coronitas','reward_welcome','reward_profile','reward_profile_trigger','prepare_care_process','reward_confirmation','reward_attendance','reward_appointment_trigger','immutable_reward_ledger','reward_summary']) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=any(array['get_reward_history','get_my_rewards','get_people_rewards','get_reward_community','save_community_preferences','adjust_coronitas','save_reward_rule','correct_attendance']) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end$$;
commit;
