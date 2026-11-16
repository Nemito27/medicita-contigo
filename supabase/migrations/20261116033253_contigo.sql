-- Medicita Contigo 2.0. Apply ONLY to a NEW, empty, independent project.
-- No connection or dependency on the original Medicita database.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public,anon,authenticated;

create table public.medical_centers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 address text not null default 'Dirección por configurar', independent boolean not null default true check(independent)
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default 'Paciente' check(length(full_name) between 1 and 100),
 last_name text not null default '' check(length(last_name)<=100),phone text not null default '' check(length(phone)<=25),
 role text not null default 'patient' check(role in ('patient','reception','admin','supervisor')),
 onboarded boolean not null default false,
 preferences jsonb not null default '{"simple_mode":false,"high_contrast":false,"reduce_motion":false,"reminder_hours":[48,24,2],"receive_offers":true}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.services (
 id uuid primary key default gen_random_uuid(),name text not null unique check(length(name) between 2 and 100),
 duration_minutes integer not null default 30 check(duration_minutes between 5 and 180 and duration_minutes%5=0),active boolean not null default true
);
create table public.professionals (
 id uuid primary key default gen_random_uuid(),full_name text not null check(length(full_name) between 2 and 100),
 service_id uuid not null references public.services(id),active boolean not null default true
);
create table public.rooms (
 id uuid primary key default gen_random_uuid(),name text not null unique check(length(name) between 2 and 100),
 specialty text not null check(length(specialty) between 2 and 100),
 status text not null default 'unavailable' check(status in ('free','busy','transition','unavailable')),
 active boolean not null default true,updated_at timestamptz not null default now()
);
create table public.schedules (
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.professionals(id),
 room_id uuid not null references public.rooms(id),weekday integer not null check(weekday between 1 and 7),
 start_time time not null,end_time time not null,active boolean not null default true,check(end_time>start_time),
 unique(professional_id,room_id,weekday,start_time)
);
create table public.schedule_exceptions (
 id uuid primary key default gen_random_uuid(),professional_id uuid references public.professionals(id),room_id uuid references public.rooms(id),
 starts_at timestamptz not null,ends_at timestamptz not null,reason text not null default 'Bloqueo administrativo' check(length(reason)<=200),
 active boolean not null default true,check(ends_at>starts_at),check(professional_id is not null or room_id is not null)
);
create table public.slots (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms(id),
 professional_id uuid not null references public.professionals(id),service_id uuid not null references public.services(id),
 starts_at timestamptz not null,ends_at timestamptz not null,duration_minutes integer not null check(duration_minutes between 5 and 180 and duration_minutes%5=0),
 created_at timestamptz not null default now(),check(ends_at=starts_at+duration_minutes*interval '1 minute'),
 unique(room_id,starts_at),unique(professional_id,starts_at)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(),slot_id uuid not null references public.slots(id),patient_id uuid not null references public.profiles(id),
 status text not null default 'reserved' check(status in ('reserved','confirmed','arrived','completed','cancelled','no_show')),
 checkin_token uuid not null default gen_random_uuid() unique,created_at timestamptz not null default now(),
 confirmed_at timestamptz,arrived_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,no_show_at timestamptz,
 cancellation_reason text,released_at timestamptz
);
create unique index one_booking_per_slot on public.appointments(slot_id) where status<>'cancelled';
create index appointments_patient on public.appointments(patient_id,created_at desc);
create table public.waiting (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),service_id uuid not null references public.services(id),
 earliest timestamptz not null,latest timestamptz not null,preferred_days integer[] not null default array[1,2,3,4,5,6,7],
 preferred_period text not null default 'any' check(preferred_period in ('any','morning','afternoon')),
 old_appointment_id uuid references public.appointments(id),receive_offers boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(latest>earliest),check(cardinality(preferred_days) between 1 and 7 and preferred_days<@array[1,2,3,4,5,6,7]),unique(patient_id,service_id)
);
create table public.offers (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),slot_id uuid not null references public.slots(id),
 old_appointment_id uuid references public.appointments(id),waiting_id uuid,
 status text not null default 'pending' check(status in ('pending','accepted','declined','expired','withdrawn')),
 created_at timestamptz not null default now(),expires_at timestamptz not null,responded_at timestamptz,check(expires_at>created_at)
);
create unique index one_pending_offer_slot on public.offers(slot_id) where status='pending';
create unique index one_pending_offer_patient on public.offers(patient_id) where status='pending';
create table public.appointment_events (
 id bigint generated always as identity primary key,appointment_id uuid references public.appointments(id),slot_id uuid references public.slots(id),
 patient_id uuid references public.profiles(id),actor_id uuid references public.profiles(id),event text not null,
 created_at timestamptz not null default now(),detail text not null default '' check(length(detail)<=300)
);
create table public.audit_log (
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(id),event text not null,
 slot_id uuid references public.slots(id),patient_id uuid references public.profiles(id),detail text not null default '',created_at timestamptz not null default now()
);
create table public.cancellations (
 id bigint generated always as identity primary key,appointment_id uuid not null unique references public.appointments(id),slot_id uuid not null references public.slots(id),
 patient_id uuid not null references public.profiles(id),released_at timestamptz not null default now(),reason text,
 notice_minutes numeric not null,reassigned_at timestamptz,used_at timestamptz
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),kind text not null,
 title text not null check(length(title)<=120),body text not null check(length(body)<=500),created_at timestamptz not null default now(),read_at timestamptz,
 appointment_id uuid references public.appointments(id),offer_id uuid references public.offers(id),dedupe_key text,
 unique(patient_id,dedupe_key)
);
create table public.notification_deliveries (
 id bigint generated always as identity primary key,notification_id uuid not null references public.notifications(id) on delete cascade,
 channel text not null default 'internal' check(channel='internal'),status text not null default 'available' check(status in ('available','read')),
 attempts integer not null default 1,last_attempt_at timestamptz not null default now(),unique(notification_id,channel)
);
create table public.checkin_events (
 id bigint generated always as identity primary key,appointment_id uuid not null unique references public.appointments(id),actor_id uuid not null references public.profiles(id),
 method text not null check(method in ('qr','manual')),created_at timestamptz not null default now()
);
create table public.system_settings (
 id integer primary key default 1 check(id=1),config jsonb not null default '{"cancellation_notice_minutes":0,"no_show_grace_minutes":15,"offer_minutes":60,"early_cancellation_hours":24}'
);
create table public.system_runs (
 id bigint generated always as identity primary key,name text not null,started_at timestamptz not null default now(),finished_at timestamptz,summary jsonb,error text
);
create index slots_date on public.slots(starts_at,service_id);
create index slots_professional on public.slots(professional_id,starts_at,ends_at);
create index slots_room on public.slots(room_id,starts_at,ends_at);
create index professionals_service on public.professionals(service_id);
create index schedules_professional on public.schedules(professional_id,weekday);
create index schedules_room on public.schedules(room_id);
create index exceptions_professional on public.schedule_exceptions(professional_id,starts_at,ends_at);
create index exceptions_room on public.schedule_exceptions(room_id,starts_at,ends_at);
create index waiting_service on public.waiting(service_id,created_at);
create index waiting_old on public.waiting(old_appointment_id);
create index offers_patient on public.offers(patient_id,created_at desc);
create index offers_old on public.offers(old_appointment_id);
create index offers_expiry on public.offers(expires_at) where status='pending';
create index events_appointment on public.appointment_events(appointment_id,created_at);
create index events_patient on public.appointment_events(patient_id,created_at);
create index events_slot on public.appointment_events(slot_id);
create index events_actor on public.appointment_events(actor_id);
create index audit_date on public.audit_log(created_at desc);
create index audit_patient on public.audit_log(patient_id);
create index audit_slot on public.audit_log(slot_id);
create index audit_actor on public.audit_log(actor_id);
create index cancellations_slot on public.cancellations(slot_id,released_at);
create index cancellations_patient on public.cancellations(patient_id);
create index notifications_patient on public.notifications(patient_id,created_at desc);
create index notifications_appointment on public.notifications(appointment_id);
create index notifications_offer on public.notifications(offer_id);
create index checkin_actor on public.checkin_events(actor_id);

create function app_private.actor_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
create function app_private.require_user() returns uuid language plpgsql stable security definer set search_path='' as $$begin if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Debes iniciar sesión nuevamente';end if;return auth.uid();end$$;
create function app_private.require_staff() returns void language plpgsql stable security definer set search_path='' as $$begin perform app_private.require_user();if app_private.actor_role() not in ('admin','reception') then raise exception 'Esta operación requiere personal autorizado';end if;end$$;
create function app_private.require_admin() returns void language plpgsql stable security definer set search_path='' as $$begin perform app_private.require_user();if app_private.actor_role()<>'admin' then raise exception 'Solo administración puede realizar esta operación';end if;end$$;
create function app_private.lock_schedule() returns void language sql set search_path='' as $$select pg_catalog.pg_advisory_xact_lock(7418622)$$;
create function app_private.setting(p_key text) returns integer language sql stable security definer set search_path='' as $$select (config->>p_key)::integer from public.system_settings where id=1$$;
create function app_private.log_event(p_event text,p_slot uuid default null,p_patient uuid default null,p_appointment uuid default null,p_detail text default '') returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_log(actor_id,event,slot_id,patient_id,detail) values(auth.uid(),p_event,p_slot,p_patient,left(coalesce(p_detail,''),300));
 if p_appointment is not null then insert into public.appointment_events(appointment_id,slot_id,patient_id,actor_id,event,detail) values(p_appointment,p_slot,p_patient,auth.uid(),p_event,left(coalesce(p_detail,''),300));end if;end$$;
create function app_private.notify(p_patient uuid,p_kind text,p_title text,p_body text,p_appointment uuid default null,p_offer uuid default null,p_key text default null) returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 insert into public.notifications(patient_id,kind,title,body,appointment_id,offer_id,dedupe_key) values(p_patient,p_kind,p_title,p_body,p_appointment,p_offer,p_key) on conflict(patient_id,dedupe_key) do nothing returning id into v_id;
 if v_id is not null then insert into public.notification_deliveries(notification_id) values(v_id);end if;return v_id;end$$;
create function app_private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.profiles(id,full_name,last_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'given_name',''),nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name',''),'Paciente'),100),left(coalesce(new.raw_user_meta_data->>'family_name',''),100));
 perform app_private.notify(new.id,'welcome','Estamos Con Tigo','Bienvenido a Medicita Contigo. Completa tus preferencias para comenzar.',null,null,'welcome');return new;end$$;
create trigger contigo_create_profile after insert on auth.users for each row execute function app_private.handle_new_user();

-- Google can be enabled before this NEW schema is installed. Backfill only
-- missing profiles, always with the patient default, and deduplicate welcome.
insert into public.profiles(id,full_name,last_name)
select u.id,left(coalesce(nullif(u.raw_user_meta_data->>'given_name',''),nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'Paciente'),100),left(coalesce(u.raw_user_meta_data->>'family_name',''),100)
from auth.users u on conflict(id) do nothing;
do $$declare u record;begin
 for u in select id from public.profiles loop
  perform app_private.notify(u.id,'welcome','Estamos Con Tigo','Bienvenido a Medicita Contigo. Completa tus preferencias para comenzar.',null,null,'welcome');
 end loop;
end$$;

-- Tables are readable only where needed. Every write is a validated RPC.
do $$declare t text;begin foreach t in array array['medical_centers','profiles','services','professionals','rooms','schedules','schedule_exceptions','slots','appointments','waiting','offers','appointment_events','audit_log','cancellations','notifications','notification_deliveries','checkin_events','system_settings','system_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;end$$;
create policy centers_read on public.medical_centers for select to authenticated using(true);
create policy services_read on public.services for select to authenticated using(true);
create policy professionals_read on public.professionals for select to authenticated using(true);
create policy rooms_read on public.rooms for select to authenticated using(true);
create policy slots_read on public.slots for select to authenticated using(true);
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
create policy appointments_read on public.appointments for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
create policy waiting_read on public.waiting for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
create policy offers_read on public.offers for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
create policy events_read on public.appointment_events for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
create policy cancellations_read on public.cancellations for select to authenticated using(patient_id=(select auth.uid()) or (select app_private.actor_role()) in ('admin','reception'));
create policy notifications_read on public.notifications for select to authenticated using(patient_id=(select auth.uid()));
create policy deliveries_read on public.notification_deliveries for select to authenticated using(exists(select 1 from public.notifications n where n.id=notification_id and n.patient_id=(select auth.uid())));
create policy audit_staff on public.audit_log for select to authenticated using((select app_private.actor_role()) in ('admin','reception'));
create policy schedules_staff on public.schedules for select to authenticated using((select app_private.actor_role()) in ('admin','reception'));
create policy exceptions_staff on public.schedule_exceptions for select to authenticated using((select app_private.actor_role()) in ('admin','reception'));
create policy checkin_staff on public.checkin_events for select to authenticated using((select app_private.actor_role()) in ('admin','reception'));
create policy settings_staff on public.system_settings for select to authenticated using((select app_private.actor_role()) in ('admin','reception','supervisor'));

insert into public.medical_centers(name) values('Centro independiente Medicita Contigo');
insert into public.system_settings(id) values(1);
insert into public.services(name,duration_minutes) values('Medicina general',30),('Odontología',45),('Enfermería',20);
insert into public.rooms(name,specialty,status) values('Box 1','Medicina general','free'),('Box 2','Odontología','unavailable'),('Box 3','Enfermería','unavailable');

-- Remaining public RPC definitions are below. Never expose the private helpers.
create function app_private.slot_enabled(p_slot public.slots) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.services sv join public.professionals pr on pr.id=p_slot.professional_id and pr.service_id=sv.id join public.rooms r on r.id=p_slot.room_id and r.specialty=sv.name where sv.id=p_slot.service_id and sv.active and pr.active and r.active)
 and not exists(select 1 from public.schedule_exceptions e where e.active and(e.professional_id=p_slot.professional_id or e.room_id=p_slot.room_id) and e.starts_at<p_slot.ends_at and e.ends_at>p_slot.starts_at)
 and ((not exists(select 1 from public.schedules h where h.professional_id=p_slot.professional_id and h.active)) or exists(select 1 from public.schedules h where h.professional_id=p_slot.professional_id and h.room_id=p_slot.room_id and h.active and h.weekday=extract(isodow from p_slot.starts_at at time zone 'America/Santiago') and h.start_time<=(p_slot.starts_at at time zone 'America/Santiago')::time and h.end_time>=(p_slot.ends_at at time zone 'America/Santiago')::time and (p_slot.starts_at at time zone 'America/Santiago')::date=(p_slot.ends_at at time zone 'America/Santiago')::date))
$$;
create function app_private.slot_json(p_slot public.slots) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p_slot)||jsonb_build_object('specialty',s.name,'professional',p.full_name,'blocked',not app_private.slot_enabled(p_slot))
 from public.services s join public.professionals p on p.id=p_slot.professional_id where s.id=p_slot.service_id
$$;
create function app_private.expire_offers() returns integer language plpgsql security definer set search_path='' as $$declare v public.offers;v_count integer:=0;begin
 for v in update public.offers set status='expired',responded_at=now() where status='pending' and expires_at<=now() returning * loop
  v_count:=v_count+1;
  perform app_private.log_event('offer_expired',v.slot_id,v.patient_id,null,'Oferta vencida');
  perform app_private.notify(v.patient_id,'offer_expired','La oferta venció','Tu solicitud sigue activa. Tu reserva anterior se mantiene si todavía corresponde.',null,v.id,'expired:'||v.id);
 end loop;return v_count;end$$;
create function app_private.patient_conflict(p_patient uuid,p_slot public.slots,p_old uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.appointments a join public.slots s on s.id=a.slot_id where a.patient_id=p_patient and a.status<>'cancelled' and a.id is distinct from p_old and s.starts_at<p_slot.ends_at and s.ends_at>p_slot.starts_at)
$$;
create function app_private.release_appointment(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;s public.slots;begin
 select * into strict a from public.appointments where id=p_id;select * into strict s from public.slots where id=a.slot_id;
 update public.appointments set status='cancelled',cancelled_at=now(),released_at=now(),cancellation_reason=nullif(left(trim(coalesce(p_reason,'')),200),'') where id=p_id;
 insert into public.cancellations(appointment_id,slot_id,patient_id,reason,notice_minutes) values(a.id,a.slot_id,a.patient_id,nullif(left(trim(coalesce(p_reason,'')),200),''),extract(epoch from(s.starts_at-now()))/60);
 update public.offers set status='withdrawn',responded_at=now() where old_appointment_id=a.id and status='pending';
 delete from public.waiting where old_appointment_id=a.id;
 perform app_private.log_event('cancelled',a.slot_id,a.patient_id,a.id,left(coalesce(p_reason,''),200));
 perform app_private.notify(a.patient_id,'cancellation','Tu hora fue cancelada en Medicita','Gracias por avisar: este cupo puede ofrecerse a otra persona. Este cambio corresponde solo a Medicita Contigo.',a.id,null,'cancel:'||a.id);
 end$$;
create function app_private.place_booking(p_slot uuid,p_patient uuid,p_old uuid default null,p_confirm boolean default false,p_offer uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare s public.slots;old_a public.appointments;v_id uuid;begin
 select * into s from public.slots where id=p_slot;
 if not found or s.starts_at<=now() then raise exception 'La hora ya no está disponible';end if;
 if not app_private.slot_enabled(s) then raise exception 'El cupo ya no coincide con la disponibilidad del profesional, box o prestación';end if;
 if exists(select 1 from public.appointments where slot_id=p_slot and status<>'cancelled') then raise exception 'Otra persona ya reservó este cupo';end if;
 if exists(select 1 from public.offers where slot_id=p_slot and status='pending' and expires_at>now() and id is distinct from p_offer) then raise exception 'El cupo tiene una oferta pendiente';end if;
 if p_old is not null then
  select * into old_a from public.appointments where id=p_old;
  if not found or old_a.patient_id<>p_patient or old_a.status not in ('reserved','confirmed') then raise exception 'Tu reserva anterior no permite este cambio';end if;
  if not exists(select 1 from public.slots os where os.id=old_a.slot_id and os.service_id=s.service_id and os.starts_at>now()+app_private.setting('cancellation_notice_minutes')*interval '1 minute') then raise exception 'No puedes cambiar esa reserva dentro del límite de cancelación';end if;
 end if;
 if app_private.patient_conflict(p_patient,s,p_old) then raise exception 'Ya tienes una reserva que coincide con este horario';end if;
 if p_old is not null then perform app_private.release_appointment(p_old,'Cambio de hora dentro de Medicita');end if;
 insert into public.appointments(slot_id,patient_id,status,confirmed_at) values(p_slot,p_patient,case when p_confirm then 'confirmed' else 'reserved' end,case when p_confirm then now() else null end) returning id into v_id;
 update public.cancellations set reassigned_at=now() where id=(select c.id from public.cancellations c where c.slot_id=p_slot and c.patient_id<>p_patient and c.reassigned_at is null order by c.released_at desc limit 1);
 delete from public.waiting where patient_id=p_patient and service_id=s.service_id;
 perform app_private.log_event(case when p_old is null then 'reserved' else 'rescheduled' end,p_slot,p_patient,v_id);
 perform app_private.notify(p_patient,case when p_old is null then 'reservation' else 'reschedule' end,case when p_confirm then 'Tu nueva hora está confirmada' else 'Tu hora está reservada' end,case when p_confirm then 'Revisa los detalles de tu atención en Medicita Contigo.' else 'Revisa tu reserva y confirma si podrás asistir. Reservar no registra asistencia.' end,v_id,null,'booking:'||v_id);
 return v_id;end$$;
create function public.book_slot(p_slot uuid,p_old uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare v uuid;begin
 perform app_private.require_user();if app_private.actor_role()='supervisor' then raise exception 'El perfil supervisor solo tiene acceso de lectura';end if;
 perform app_private.lock_schedule();perform app_private.expire_offers();v:=app_private.place_booking(p_slot,auth.uid(),p_old,false,null);
 update public.offers set status='withdrawn',responded_at=now() where patient_id=auth.uid() and status='pending';return v;end$$;
create function public.change_appointment(p_id uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;s public.slots;v_staff boolean;begin
 perform app_private.require_user();perform app_private.lock_schedule();v_staff:=app_private.actor_role() in ('admin','reception');
 select * into a from public.appointments where id=p_id;
 if not found or not(a.patient_id=auth.uid() or v_staff) or app_private.actor_role()='supervisor' then raise exception 'No puedes modificar esta reserva';end if;
 select * into strict s from public.slots where id=a.slot_id;
 if p_action='confirm' and a.status='reserved' and s.starts_at>now() then
  update public.appointments set status='confirmed',confirmed_at=now() where id=a.id;
  perform app_private.log_event('confirmed',a.slot_id,a.patient_id,a.id);
  perform app_private.notify(a.patient_id,'confirmation','¡Tu hora está confirmada!','Gracias por confirmar tu intención de asistir a esta reserva de Medicita.',a.id,null,'confirmed:'||a.id);
 elsif p_action='cancel' and a.status in ('reserved','confirmed') and s.starts_at>now()+app_private.setting('cancellation_notice_minutes')*interval '1 minute' then
  perform app_private.release_appointment(a.id,p_reason);
 elsif p_action='complete' and v_staff and a.status='arrived' and s.starts_at<=now() then
  update public.appointments set status='completed',completed_at=now() where id=a.id;
  update public.rooms set status='transition',updated_at=now() where id=s.room_id;
  update public.cancellations set used_at=now() where id=(select c.id from public.cancellations c where c.slot_id=a.slot_id and c.patient_id<>a.patient_id and c.reassigned_at<=a.created_at and c.used_at is null order by c.released_at desc limit 1);
  perform app_private.log_event('completed',a.slot_id,a.patient_id,a.id);
 elsif p_action='no_show' and v_staff and a.status in ('reserved','confirmed') and s.ends_at+app_private.setting('no_show_grace_minutes')*interval '1 minute'<=now() then
  update public.appointments set status='no_show',no_show_at=now() where id=a.id;
  perform app_private.log_event('no_show',a.slot_id,a.patient_id,a.id,'Ausencia registrada por personal autorizado después del plazo');
 else raise exception 'La acción no corresponde al estado, fecha o permisos de esta reserva';end if;end$$;
create function public.register_arrival(p_token uuid default null,p_appointment uuid default null) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;s public.slots;begin
 perform app_private.require_staff();perform app_private.lock_schedule();
 if (p_token is null)=(p_appointment is null) then raise exception 'Usa un código QR o selecciona una reserva, no ambos';end if;
 select * into a from public.appointments where (p_token is not null and checkin_token=p_token) or (p_appointment is not null and id=p_appointment);
 if not found or a.status not in ('reserved','confirmed') then raise exception 'La credencial no es válida o ya fue utilizada';end if;
 select * into strict s from public.slots where id=a.slot_id;
 if (s.starts_at at time zone 'America/Santiago')::date<>(now() at time zone 'America/Santiago')::date then raise exception 'La llegada se registra el día de la reserva';end if;
 update public.appointments set status='arrived',arrived_at=now() where id=a.id;
 insert into public.checkin_events(appointment_id,actor_id,method) values(a.id,auth.uid(),case when p_token is null then 'manual' else 'qr' end);
 perform app_private.log_event('arrived',a.slot_id,a.patient_id,a.id,case when p_token is null then 'Identificación alternativa por recepción' else 'Credencial QR validada' end);
 end$$;
create function public.set_room(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$begin
 perform app_private.require_staff();if p_status not in ('free','busy','transition','unavailable') then raise exception 'Estado de box inválido';end if;
 update public.rooms set status=p_status,updated_at=now() where id=p_id;if not found then raise exception 'No encontramos ese box';end if;
 perform app_private.log_event('room_updated',null,null,null,'Estado de box: '||p_status);end$$;
create function public.create_slot(p_room uuid,p_professional uuid,p_service uuid,p_start timestamptz,p_duration integer default null) returns uuid language plpgsql security definer set search_path='' as $$declare v_duration integer;v_end timestamptz;v_id uuid;v_local timestamp;begin
 perform app_private.require_staff();perform app_private.lock_schedule();
 if p_start is null or p_start<=now() or p_start>now()+interval '2 years' or extract(second from p_start)<>0 then raise exception 'Elige una fecha futura válida, sin segundos';end if;
 select coalesce(p_duration,duration_minutes) into v_duration from public.services where id=p_service and active;
 if not found or v_duration not between 5 and 180 or v_duration%5<>0 then raise exception 'Duración o prestación inválida';end if;
 if not exists(select 1 from public.professionals where id=p_professional and active and service_id=p_service) then raise exception 'El profesional no está habilitado para esa prestación';end if;
 if not exists(select 1 from public.rooms r join public.services s on s.name=r.specialty where r.id=p_room and r.active and s.id=p_service) then raise exception 'El box no corresponde a esa prestación';end if;
 v_end:=p_start+v_duration*interval '1 minute';v_local:=p_start at time zone 'America/Santiago';
 if (v_end at time zone 'America/Santiago')::date<>v_local::date then raise exception 'El horario debe terminar en la misma jornada';end if;
 if exists(select 1 from public.schedules where professional_id=p_professional and active) and not exists(select 1 from public.schedules where professional_id=p_professional and room_id=p_room and active and weekday=extract(isodow from v_local) and start_time<=v_local::time and end_time>=(v_end at time zone 'America/Santiago')::time) then raise exception 'El horario está fuera de la jornada configurada';end if;
 if exists(select 1 from public.schedule_exceptions where active and (professional_id=p_professional or room_id=p_room) and starts_at<v_end and ends_at>p_start) then raise exception 'Existe un bloqueo o ausencia para este horario';end if;
 if exists(select 1 from public.slots where (professional_id=p_professional or room_id=p_room) and starts_at<v_end and ends_at>p_start) then raise exception 'El profesional o el box ya tiene un horario que se superpone';end if;
 insert into public.slots(room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) values(p_room,p_professional,p_service,p_start,v_end,v_duration) returning id into v_id;
 perform app_private.log_event('slot_created',v_id,null,null,'Cupo independiente creado');return v_id;end$$;
create function public.join_waitlist(p_service uuid,p_earliest timestamptz,p_latest timestamptz,p_days integer[] default array[1,2,3,4,5,6,7],p_period text default 'any',p_old uuid default null,p_receive_offers boolean default true,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 perform app_private.require_user();if app_private.actor_role()='supervisor' then raise exception 'El perfil supervisor solo tiene acceso de lectura';end if;perform app_private.lock_schedule();
 if p_earliest is null or p_latest is null or p_earliest<now() or p_latest<=p_earliest or p_latest>now()+interval '1 year' then raise exception 'Elige un rango futuro de hasta un año';end if;
 if p_days is null or cardinality(p_days) not between 1 and 7 or not p_days<@array[1,2,3,4,5,6,7] or p_period not in ('any','morning','afternoon') or p_receive_offers is null then raise exception 'Preferencias de disponibilidad inválidas';end if;
 if not exists(select 1 from public.services where id=p_service and active) then raise exception 'La prestación no está habilitada';end if;
 if p_old is not null and not exists(select 1 from public.appointments a join public.slots s on s.id=a.slot_id where a.id=p_old and a.patient_id=auth.uid() and a.status in ('reserved','confirmed') and s.service_id=p_service and s.starts_at>p_earliest) then raise exception 'La reserva a adelantar no es compatible';end if;
 if p_id is not null then
  update public.waiting set service_id=p_service,earliest=p_earliest,latest=p_latest,preferred_days=p_days,preferred_period=p_period,old_appointment_id=p_old,receive_offers=p_receive_offers,updated_at=now() where id=p_id and patient_id=auth.uid() returning id into v_id;
  if not found then raise exception 'No encontramos tu solicitud';end if;
 else
  insert into public.waiting(patient_id,service_id,earliest,latest,preferred_days,preferred_period,old_appointment_id,receive_offers) values(auth.uid(),p_service,p_earliest,p_latest,p_days,p_period,p_old,p_receive_offers)
  on conflict(patient_id,service_id) do update set earliest=excluded.earliest,latest=excluded.latest,preferred_days=excluded.preferred_days,preferred_period=excluded.preferred_period,old_appointment_id=excluded.old_appointment_id,receive_offers=excluded.receive_offers,updated_at=now() returning id into v_id;
 end if;
 update public.offers set status='withdrawn',responded_at=now() where waiting_id=v_id and status='pending';
 perform app_private.log_event('waitlist_updated',null,auth.uid(),null,'Preferencias de disponibilidad actualizadas');return v_id;end$$;
create function public.leave_waitlist(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform app_private.require_user();if app_private.actor_role()='supervisor' then raise exception 'El perfil supervisor solo tiene acceso de lectura';end if;perform app_private.lock_schedule();
 delete from public.waiting where id=p_id and patient_id=auth.uid();
 if found then update public.offers set status='withdrawn',responded_at=now() where waiting_id=p_id and patient_id=auth.uid() and status='pending';perform app_private.log_event('waitlist_left',null,auth.uid());end if;end$$;
create function app_private.is_candidate(p_wait public.waiting,p_slot public.slots) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.slot_enabled(p_slot) and p_wait.receive_offers and coalesce((select (preferences->>'receive_offers')::boolean from public.profiles where id=p_wait.patient_id),true)
 and p_wait.service_id=p_slot.service_id and p_wait.earliest<=p_slot.starts_at and p_wait.latest>=p_slot.ends_at
 and extract(isodow from p_slot.starts_at at time zone 'America/Santiago')::integer=any(p_wait.preferred_days)
 and (p_wait.preferred_period='any' or (p_wait.preferred_period='morning' and (p_slot.starts_at at time zone 'America/Santiago')::time<'12:00'::time and (p_slot.ends_at at time zone 'America/Santiago')::time<='12:00'::time) or (p_wait.preferred_period='afternoon' and (p_slot.starts_at at time zone 'America/Santiago')::time>='12:00'::time))
 and (p_wait.old_appointment_id is null or exists(select 1 from public.appointments a join public.slots os on os.id=a.slot_id where a.id=p_wait.old_appointment_id and a.patient_id=p_wait.patient_id and a.status in ('reserved','confirmed') and os.service_id=p_slot.service_id and os.starts_at>p_slot.starts_at and os.starts_at>now()+app_private.setting('cancellation_notice_minutes')*interval '1 minute'))
 and not app_private.patient_conflict(p_wait.patient_id,p_slot,p_wait.old_appointment_id)
 and not exists(select 1 from public.offers o where o.patient_id=p_wait.patient_id and o.status='pending' and o.expires_at>now())
$$;
create function public.compatible_candidates(p_slot uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare s public.slots;v jsonb;begin
 perform app_private.require_staff();select * into s from public.slots where id=p_slot;
 if not found or s.starts_at<=now() or exists(select 1 from public.appointments where slot_id=s.id and status<>'cancelled') or exists(select 1 from public.offers where slot_id=s.id and status='pending' and expires_at>now()) or exists(select 1 from public.schedule_exceptions e where e.active and (e.professional_id=s.professional_id or e.room_id=s.room_id) and e.starts_at<s.ends_at and e.ends_at>s.starts_at) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(q.row order by q.created_at),'[]') into v from (select to_jsonb(w)||jsonb_build_object('patient_name',trim(p.full_name||' '||p.last_name),'specialty',sv.name) as row,w.created_at from public.waiting w join public.profiles p on p.id=w.patient_id join public.services sv on sv.id=w.service_id where app_private.is_candidate(w,s) order by w.created_at,w.id limit 100) q;
 return v;end$$;
create function public.make_offer(p_slot uuid,p_wait uuid) returns uuid language plpgsql security definer set search_path='' as $$declare s public.slots;w public.waiting;v_id uuid;begin
 perform app_private.require_staff();perform app_private.lock_schedule();perform app_private.expire_offers();
 select * into s from public.slots where id=p_slot;select * into w from public.waiting where id=p_wait;
 if s.id is null or w.id is null or s.starts_at<=now() or not app_private.is_candidate(w,s) then raise exception 'La solicitud no es compatible con este horario';end if;
 if exists(select 1 from public.appointments where slot_id=s.id and status<>'cancelled') or exists(select 1 from public.offers where slot_id=s.id and status='pending') then raise exception 'El cupo ya está reservado o tiene una oferta';end if;
 if exists(select 1 from public.schedule_exceptions e where e.active and (e.professional_id=s.professional_id or e.room_id=s.room_id) and e.starts_at<s.ends_at and e.ends_at>s.starts_at) then raise exception 'Este horario está bloqueado';end if;
 if not exists(select 1 from public.services where id=s.service_id and active) or not exists(select 1 from public.professionals where id=s.professional_id and active) or not exists(select 1 from public.rooms where id=s.room_id and active) then raise exception 'La atención no está habilitada';end if;
 insert into public.offers(patient_id,slot_id,old_appointment_id,waiting_id,expires_at) values(w.patient_id,s.id,w.old_appointment_id,w.id,least(now()+app_private.setting('offer_minutes')*interval '1 minute',s.starts_at)) returning id into v_id;
 perform app_private.log_event('offered',s.id,w.patient_id,null,'Oferta supervisada por personal autorizado');
 perform app_private.notify(w.patient_id,'offer','Una hora más cerca','Hay un cupo compatible disponible en Medicita. Puedes aceptarlo o conservar tu reserva actual.',null,v_id,'offer:'||v_id);return v_id;end$$;
create function public.respond_offer(p_id uuid,p_accept boolean) returns uuid language plpgsql security definer set search_path='' as $$declare o public.offers;v_id uuid;begin
 perform app_private.require_user();if app_private.actor_role()='supervisor' then raise exception 'El perfil supervisor solo tiene acceso de lectura';end if;perform app_private.lock_schedule();perform app_private.expire_offers();
 select * into o from public.offers where id=p_id;
 if not found or o.patient_id<>auth.uid() or o.status<>'pending' or o.expires_at<=now() or p_accept is null then raise exception 'Esta oferta ya no está disponible para tu cuenta';end if;
 if p_accept then
  v_id:=app_private.place_booking(o.slot_id,o.patient_id,o.old_appointment_id,true,o.id);
  update public.offers set status='accepted',responded_at=now() where id=o.id;
  perform app_private.log_event('offer_accepted',o.slot_id,o.patient_id,v_id,'Oferta aceptada; la recuperación efectiva se registra al completar la atención');
 else
  update public.offers set status='declined',responded_at=now() where id=o.id;
  perform app_private.log_event('offer_declined',o.slot_id,o.patient_id);
  perform app_private.notify(o.patient_id,'offer_declined','Conservas tu hora actual','Rechazaste la oferta. Tu solicitud permanece activa y tu reserva anterior se conserva.',null,o.id,'declined:'||o.id);
 end if;return v_id;end$$;
create function public.withdraw_offer(p_id uuid) returns void language plpgsql security definer set search_path='' as $$declare o public.offers;begin
 perform app_private.require_staff();perform app_private.lock_schedule();perform app_private.expire_offers();
 update public.offers set status='withdrawn',responded_at=now() where id=p_id and status='pending' returning * into o;
 if not found then raise exception 'La oferta ya no está pendiente';end if;
 perform app_private.log_event('offer_withdrawn',o.slot_id,o.patient_id);
 perform app_private.notify(o.patient_id,'offer_withdrawn','La oferta fue retirada','El equipo retiró esta oferta. Tu reserva anterior se mantiene y puedes revisar tu lista de espera.',null,o.id,'withdrawn:'||o.id);end$$;
create function public.save_profile(p_name text,p_last_name text,p_phone text,p_preferences jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$declare k text;v jsonb;begin
 perform app_private.require_user();
 if p_name is null or length(trim(p_name)) not between 2 and 100 or p_last_name is null or length(trim(p_last_name))>100 or p_phone is null or length(p_phone)>25 then raise exception 'Revisa el nombre, apellido y teléfono';end if;
 if p_preferences is null or jsonb_typeof(p_preferences)<>'object' or (p_preferences-array['simple_mode','high_contrast','reduce_motion','reminder_hours','receive_offers'])<>'{}'::jsonb then raise exception 'Preferencias inválidas';end if;
 foreach k in array array['simple_mode','high_contrast','reduce_motion','receive_offers'] loop
  if p_preferences ? k and jsonb_typeof(p_preferences->k)<>'boolean' then raise exception 'Las preferencias deben indicar verdadero o falso';end if;
 end loop;
 if p_preferences ? 'reminder_hours' then
  if jsonb_typeof(p_preferences->'reminder_hours')<>'array' or jsonb_array_length(p_preferences->'reminder_hours')>4 then raise exception 'Elige hasta cuatro recordatorios';end if;
  for v in select value from jsonb_array_elements(p_preferences->'reminder_hours') loop
   if jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or (v::text)::integer not between 1 and 72 then raise exception 'Los recordatorios deben estar entre 1 y 72 horas antes';end if;
  end loop;
 end if;
 update public.profiles set full_name=trim(p_name),last_name=trim(p_last_name),phone=trim(p_phone),preferences=preferences||p_preferences,onboarded=true,updated_at=now() where id=auth.uid();
 perform app_private.log_event('profile_updated',null,auth.uid(),null,'Datos mínimos y preferencias actualizados');end$$;
create function public.set_user_role(p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$begin
 perform app_private.require_admin();
 if p_user is null or p_user=auth.uid() then raise exception 'No puedes modificar tu propio rol';end if;
 if p_role not in ('patient','reception','admin','supervisor') then raise exception 'Rol inválido';end if;
 update public.profiles set role=p_role,updated_at=now() where id=p_user;
 if not found then raise exception 'La persona debe ingresar primero a Medicita Contigo';end if;
 perform app_private.log_event('role_updated',null,p_user,null,'Rol asignado: '||p_role);end$$;
create function public.mark_notification(p_id uuid,p_read boolean default true) returns void language plpgsql security definer set search_path='' as $$begin
 perform app_private.require_user();update public.notifications set read_at=case when p_read then coalesce(read_at,now()) else null end where id=p_id and patient_id=auth.uid();
 if not found then raise exception 'No encontramos tu notificación';end if;
 update public.notification_deliveries set status=case when p_read then 'read' else 'available' end where notification_id=p_id;end$$;
create function public.admin_message(p_user uuid,p_message text) returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 perform app_private.require_staff();if p_message is null or length(trim(p_message)) not between 2 and 500 or not exists(select 1 from public.profiles where id=p_user) then raise exception 'Revisa el destinatario y el mensaje';end if;
 v_id:=app_private.notify(p_user,'administrative','Mensaje del equipo',trim(p_message));perform app_private.log_event('message_created',null,p_user,null,'Mensaje administrativo interno');return v_id;end$$;
create function public.save_resource(p_kind text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare v_id uuid;v_old text;v_new text;v_key text;v_int integer;v_start timestamptz;v_end timestamptz;v_prof uuid;v_room uuid;begin
 perform app_private.require_admin();perform app_private.lock_schedule();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Datos de configuración inválidos';end if;
 if p_kind='setting' then
  for v_key in select jsonb_object_keys(p_data) loop
   if v_key not in ('cancellation_notice_minutes','no_show_grace_minutes','offer_minutes','early_cancellation_hours') then raise exception 'Configuración no reconocida';end if;
   if jsonb_typeof(p_data->v_key)<>'number' or (p_data->>v_key) !~ '^[0-9]+$' then raise exception 'La configuración debe contener números enteros, sin valores nulos';end if;v_int:=(p_data->>v_key)::integer;
   if (v_key='cancellation_notice_minutes' and v_int not between 0 and 10080) or (v_key='no_show_grace_minutes' and v_int not between 0 and 240) or (v_key='offer_minutes' and v_int not between 1 and 1440) or (v_key='early_cancellation_hours' and v_int not between 1 and 168) then raise exception 'Valor de configuración fuera de rango';end if;
  end loop;
  update public.system_settings set config=config||p_data where id=1;
  perform app_private.log_event('settings_updated');return jsonb_build_object('kind','setting','settings',(select config from public.system_settings where id=1));
 end if;
 v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 if p_kind='service' then
  select name into v_old from public.services where id=v_id;v_new:=trim(p_data->>'name');
  insert into public.services(id,name,duration_minutes,active) values(v_id,v_new,(p_data->>'duration_minutes')::integer,coalesce((p_data->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,duration_minutes=excluded.duration_minutes,active=excluded.active;
  if v_old is not null and v_old<>v_new then update public.rooms set specialty=v_new where specialty=v_old;end if;
 elsif p_kind='professional' then
  insert into public.professionals(id,full_name,service_id,active) values(v_id,trim(p_data->>'full_name'),(p_data->>'service_id')::uuid,coalesce((p_data->>'active')::boolean,true)) on conflict(id) do update set full_name=excluded.full_name,service_id=excluded.service_id,active=excluded.active;
 elsif p_kind='room' then
  if not exists(select 1 from public.services where name=trim(p_data->>'specialty')) then raise exception 'Selecciona una prestación existente para el box';end if;
  insert into public.rooms(id,name,specialty,active) values(v_id,trim(p_data->>'name'),trim(p_data->>'specialty'),coalesce((p_data->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,specialty=excluded.specialty,active=excluded.active,updated_at=now();
 elsif p_kind='schedule' then
  if exists(select 1 from public.schedules where id<>v_id and active and professional_id=(p_data->>'professional_id')::uuid and weekday=(p_data->>'weekday')::integer and start_time<(p_data->>'end_time')::time and end_time>(p_data->>'start_time')::time) then raise exception 'La jornada se superpone con otro horario del profesional';end if;
  if not exists(select 1 from public.professionals p join public.services s on s.id=p.service_id join public.rooms r on r.specialty=s.name where p.id=(p_data->>'professional_id')::uuid and r.id=(p_data->>'room_id')::uuid and p.active and r.active and s.active) then raise exception 'Box y profesional incompatibles';end if;
  insert into public.schedules(id,professional_id,room_id,weekday,start_time,end_time,active) values(v_id,(p_data->>'professional_id')::uuid,(p_data->>'room_id')::uuid,(p_data->>'weekday')::integer,(p_data->>'start_time')::time,(p_data->>'end_time')::time,coalesce((p_data->>'active')::boolean,true)) on conflict(id) do update set professional_id=excluded.professional_id,room_id=excluded.room_id,weekday=excluded.weekday,start_time=excluded.start_time,end_time=excluded.end_time,active=excluded.active;
 elsif p_kind='block' then
  v_prof:=nullif(p_data->>'professional_id','')::uuid;v_room:=nullif(p_data->>'room_id','')::uuid;v_start:=(p_data->>'starts_at')::timestamptz;v_end:=(p_data->>'ends_at')::timestamptz;
  if v_start is null or v_end is null or v_end<=v_start or v_end<=now() or (v_prof is null and v_room is null) then raise exception 'Selecciona un recurso y un intervalo válido para el bloqueo';end if;
  if coalesce((p_data->>'active')::boolean,true) and exists(select 1 from public.appointments a join public.slots s on s.id=a.slot_id where a.status in ('reserved','confirmed','arrived') and (s.professional_id=v_prof or s.room_id=v_room) and s.starts_at<v_end and s.ends_at>v_start) then raise exception 'Primero resuelve las reservas existentes; no se cancelan automáticamente';end if;
  insert into public.schedule_exceptions(id,professional_id,room_id,starts_at,ends_at,reason,active) values(v_id,v_prof,v_room,v_start,v_end,left(coalesce(nullif(trim(p_data->>'reason'),''),'Bloqueo administrativo'),200),coalesce((p_data->>'active')::boolean,true)) on conflict(id) do update set professional_id=excluded.professional_id,room_id=excluded.room_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,active=excluded.active;
 else raise exception 'Tipo de configuración no reconocido';end if;
 perform app_private.log_event('resource_updated',null,null,null,'Recurso: '||p_kind);return jsonb_build_object('id',v_id,'kind',p_kind);end$$;

create function public.get_report(p_from date,p_to date,p_service uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare v jsonb;begin
 perform app_private.require_user();if app_private.actor_role() not in ('admin','reception','supervisor') then raise exception 'El reporte requiere un rol autorizado';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Selecciona un período de hasta 366 días';end if;
 with selected as (
  select s.* from public.slots s where s.starts_at>=(p_from::timestamp at time zone 'America/Santiago') and s.starts_at<((p_to+1)::timestamp at time zone 'America/Santiago') and (p_service is null or s.service_id=p_service)
 ), apps as (select a.*,s.starts_at,s.ends_at from public.appointments a join selected s on s.id=a.slot_id),
 canc as (select c.* from public.cancellations c join selected s on s.id=c.slot_id),
 ofs as (select o.* from public.offers o join selected s on s.id=o.slot_id),
 recovered as (select distinct c.slot_id from canc c join apps a on a.slot_id=c.slot_id and a.patient_id<>c.patient_id and a.status='completed' and a.created_at>=c.released_at),
 reassigned as (select distinct c.slot_id from canc c join apps a on a.slot_id=c.slot_id and a.patient_id<>c.patient_id and a.status<>'cancelled' and a.created_at>=c.released_at),
 availability as (select s.id from selected s where s.starts_at>now() and app_private.slot_enabled(s) and not exists(select 1 from apps a where a.slot_id=s.id and a.status<>'cancelled') and not exists(select 1 from ofs o where o.slot_id=s.id and o.status='pending' and o.expires_at>now())),
 day_values as (select d::date as day from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d),
 daily as (select d.day,(select count(*) from selected s where (s.starts_at at time zone 'America/Santiago')::date=d.day) as total,
  (select count(*) from apps a where (a.starts_at at time zone 'America/Santiago')::date=d.day and a.status in ('reserved','confirmed','arrived')) as reserved,
  (select count(*) from apps a where (a.starts_at at time zone 'America/Santiago')::date=d.day and a.status='completed') as completed,
  (select count(*) from apps a where (a.starts_at at time zone 'America/Santiago')::date=d.day and a.status='cancelled') as cancelled,
  (select count(*) from apps a where (a.starts_at at time zone 'America/Santiago')::date=d.day and a.status='no_show') as no_show,
  (select count(*) from recovered r join selected s on s.id=r.slot_id where (s.starts_at at time zone 'America/Santiago')::date=d.day) as recovered
  from day_values d)
 select jsonb_build_object(
 'total_slots',(select count(*) from selected),'available_slots',(select count(*) from availability),
 'reserved',(select count(*) from apps where status='reserved'),'confirmed',(select count(*) from apps where status='confirmed'),
 'arrived',(select count(*) from apps where status='arrived'),'completed',(select count(*) from apps where status='completed'),
 'cancelled',(select count(*) from apps where status='cancelled'),'no_show',(select count(*) from apps where status='no_show'),
 'released_slots',(select count(distinct slot_id) from canc),'reassigned_slots',(select count(*) from reassigned),'recovered_slots',(select count(*) from recovered),
 'pending_offers',(select count(*) from ofs where status='pending' and expires_at>now()),
 'waiting_people',(select count(distinct patient_id) from public.waiting where latest>now() and (p_service is null or service_id=p_service)),
 'occupancy_rate',coalesce(round(100.0*(select count(*) from apps where status in ('reserved','confirmed','arrived'))/nullif((select count(*) from selected),0),1),0),
 'no_show_rate',coalesce(round(100.0*(select count(*) from apps where status='no_show' and starts_at<=now())/nullif((select count(*) from apps where status in ('completed','no_show') and starts_at<=now()),0),1),0),
 'early_cancellation_rate',coalesce(round(100.0*(select count(*) from canc where notice_minutes>=app_private.setting('early_cancellation_hours')*60)/nullif((select count(*) from canc),0),1),0),
 'average_recovery_minutes',(select round(avg(extract(epoch from(n.created_at-c.released_at))/60),1) from canc c join lateral(select a.created_at from public.appointments a where a.slot_id=c.slot_id and a.patient_id<>c.patient_id and a.created_at>=c.released_at order by a.created_at limit 1)n on true),
 'offers_sent',(select count(*) from ofs),'offers_accepted',(select count(*) from ofs where status='accepted'),
 'offers_declined',(select count(*) from ofs where status='declined'),'offers_expired',(select count(*) from ofs where status='expired' or(status='pending' and expires_at<=now())),
 'daily',(select coalesce(jsonb_agg(jsonb_build_object('date',day,'total',total,'reserved',reserved,'completed',completed,'cancelled',cancelled,'no_show',no_show,'recovered',recovered) order by day),'[]') from daily),
 'definitions',jsonb_build_object('period','Fecha de atención en America/Santiago','occupancy_rate','Reservas activas (reservada, confirmada o llegada) / cupos creados. No equivale a asistencia.',
 'no_show_rate','Ausencias registradas / (atenciones completadas + ausencias), solo horas finalizadas; excluye futuras y canceladas.',
 'early_cancellation_rate','Cancelaciones con anticipación igual o mayor al umbral / cancelaciones registradas.',
 'recovered_slots','Cupos liberados que terminaron en una atención completada por otra persona; no cuenta solo aceptar una oferta.',
 'average_recovery_minutes','Minutos entre cada liberación y su primera nueva asignación a otra persona. No equivale a atención completada.')) into v;
 return v;end$$;
create function public.get_snapshot(p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid;v_role text;v_staff boolean;v_reporter boolean;v_from date;v_to date;v_start timestamptz;v_end timestamptz;
 v_offset integer;v_limit integer;v_service uuid;v_prof uuid;v_room uuid;v_total integer;
 v_appts jsonb:='[]';v_wait jsonb:='[]';v_offers jsonb:='[]';v_slots jsonb:='[]';v_available jsonb:='[]';v_profiles jsonb:='[]';v_events jsonb:='[]';v_cancel jsonb:='[]';v_audit jsonb:='[]';v_report jsonb:='{}';
begin
 v_user:=app_private.require_user();v_role:=app_private.actor_role();v_staff:=v_role in ('admin','reception');v_reporter:=v_role in ('admin','reception','supervisor');
 if p_filters is null or jsonb_typeof(p_filters)<>'object' then raise exception 'Filtros inválidos';end if;
 v_from:=coalesce(nullif(p_filters->>'from','')::date,(now() at time zone 'America/Santiago')::date);
 v_to:=coalesce(nullif(p_filters->>'to','')::date,v_from+30);
 if v_to<v_from or v_to-v_from>93 then raise exception 'Selecciona un período de hasta 93 días';end if;
 v_start:=v_from::timestamp at time zone 'America/Santiago';v_end:=(v_to+1)::timestamp at time zone 'America/Santiago';
 v_offset:=greatest(0,coalesce((p_filters->>'offset')::integer,0));v_limit:=least(100,greatest(1,coalesce((p_filters->>'limit')::integer,100)));
 v_service:=nullif(p_filters->>'service_id','')::uuid;v_prof:=nullif(p_filters->>'professional_id','')::uuid;v_room:=nullif(p_filters->>'room_id','')::uuid;
 select count(*) into v_total from public.slots s where s.starts_at>=v_start and s.starts_at<v_end and(v_service is null or s.service_id=v_service) and(v_prof is null or s.professional_id=v_prof) and(v_room is null or s.room_id=v_room);
 if v_role<>'supervisor' then
  select coalesce(jsonb_agg(q.row order by q.starts_at),'[]') into v_appts from (
   select to_jsonb(a)||jsonb_build_object('patient_name',case when v_staff then trim(p.full_name||' '||p.last_name) else '' end) as row,s.starts_at
   from public.appointments a join public.slots s on s.id=a.slot_id join public.profiles p on p.id=a.patient_id
   where (v_staff or a.patient_id=v_user) and s.starts_at>=v_start and s.starts_at<v_end and(v_service is null or s.service_id=v_service) and(v_prof is null or s.professional_id=v_prof) and(v_room is null or s.room_id=v_room)
   order by s.starts_at,a.id offset v_offset limit v_limit)q;
  select coalesce(jsonb_agg(q.row order by q.created_at),'[]') into v_wait from (
   select to_jsonb(w)||jsonb_build_object('specialty',s.name,'patient_name',case when v_staff then trim(p.full_name||' '||p.last_name) else '' end) as row,w.created_at
   from public.waiting w join public.services s on s.id=w.service_id join public.profiles p on p.id=w.patient_id
   where (v_staff or w.patient_id=v_user) and(v_service is null or w.service_id=v_service)
   order by w.created_at,w.id offset v_offset limit v_limit)q;
  select coalesce(jsonb_agg(q.row order by q.created_at desc),'[]') into v_offers from (
   select to_jsonb(o)||jsonb_build_object('status',case when o.status='pending' and o.expires_at<=now() then 'expired' else o.status end,'patient_name',case when v_staff then trim(p.full_name||' '||p.last_name) else '' end) as row,o.created_at
   from public.offers o join public.profiles p on p.id=o.patient_id join public.slots s on s.id=o.slot_id
   where(v_staff or o.patient_id=v_user) and(v_service is null or s.service_id=v_service)
   order by o.created_at desc,o.id offset v_offset limit v_limit)q;
  -- Keep the nearest owned future reservation and old reservations referenced by
  -- visible offers available even when the calendar window excludes them.
  -- At most the paginated appointments + paginated offer references + one next.
  if not v_staff then
   select coalesce(jsonb_agg(q.row),'[]') into v_appts from (
    select x as row from jsonb_array_elements(v_appts)x
    union all
    select to_jsonb(a)||jsonb_build_object('patient_name','') as row from public.appointments a
    where a.patient_id=v_user and not exists(select 1 from jsonb_array_elements(v_appts)x where x->>'id'=a.id::text)
    and(a.id in(select (x->>'old_appointment_id')::uuid from jsonb_array_elements(v_offers)x where x->>'old_appointment_id' is not null)
      or a.id=(select n.id from public.appointments n join public.slots ns on ns.id=n.slot_id where n.patient_id=v_user and n.status in ('reserved','confirmed','arrived') and ns.starts_at>now() order by ns.starts_at,n.id limit 1))
    limit v_limit*2+1
   )q;
  end if;
  select coalesce(jsonb_agg(q.row order by q.starts_at),'[]') into v_slots from (
   select app_private.slot_json(s) as row,s.starts_at from public.slots s where s.id in (
    select z.id from public.slots z where z.starts_at>=v_start and z.starts_at<v_end and(v_service is null or z.service_id=v_service) and(v_prof is null or z.professional_id=v_prof) and(v_room is null or z.room_id=v_room) order by z.starts_at,z.id offset v_offset limit v_limit
   ) or s.id in(select (x->>'slot_id')::uuid from jsonb_array_elements(v_appts)x)
   or s.id in(select (x->>'slot_id')::uuid from jsonb_array_elements(v_offers)x)
   or s.id in(select a.slot_id from public.appointments a where a.id in(select (x->>'old_appointment_id')::uuid from jsonb_array_elements(v_offers)x where x->>'old_appointment_id' is not null) and(v_staff or a.patient_id=v_user))
   order by s.starts_at,s.id limit v_limit*4)q;
  select coalesce(jsonb_agg(q.row order by q.starts_at),'[]') into v_available from (
   select app_private.slot_json(s) as row,s.starts_at from public.slots s join public.services sv on sv.id=s.service_id and sv.active join public.professionals pr on pr.id=s.professional_id and pr.active join public.rooms r on r.id=s.room_id and r.active
   where s.starts_at>now() and s.starts_at>=v_start and s.starts_at<v_end and(v_service is null or s.service_id=v_service) and(v_prof is null or s.professional_id=v_prof) and(v_room is null or s.room_id=v_room)
   and not exists(select 1 from public.appointments a where a.slot_id=s.id and a.status<>'cancelled')
   and not exists(select 1 from public.offers o where o.slot_id=s.id and o.status='pending' and o.expires_at>now())
   and app_private.slot_enabled(s)
   order by s.starts_at,s.id offset v_offset limit v_limit)q;
  select coalesce(jsonb_agg(q.row),'[]') into v_profiles from (
   select jsonb_build_object('id',p.id,'full_name',p.full_name,'last_name',p.last_name,'role',p.role,'phone',case when v_staff then p.phone else '' end) as row
   from public.profiles p where p.id=v_user or(v_role='admin') or(v_staff and(p.id in(select (x->>'patient_id')::uuid from jsonb_array_elements(v_appts)x) or p.id in(select (x->>'patient_id')::uuid from jsonb_array_elements(v_wait)x) or p.id in(select (x->>'patient_id')::uuid from jsonb_array_elements(v_offers)x)))
   order by p.created_at desc,p.id offset case when v_role='admin' then v_offset else 0 end limit v_limit)q;
  select coalesce(jsonb_agg(q.row order by q.created_at desc),'[]') into v_events from (
   select to_jsonb(e) as row,e.created_at from public.appointment_events e where (v_staff or e.patient_id=v_user) and e.appointment_id in(select (x->>'id')::uuid from jsonb_array_elements(v_appts)x) order by e.created_at desc,e.id limit v_limit)q;
  select coalesce(jsonb_agg(q.row order by q.released_at desc),'[]') into v_cancel from (
   select to_jsonb(c)||jsonb_build_object('patient_name',case when v_staff then trim(p.full_name||' '||p.last_name) else '' end) as row,c.released_at
   from public.cancellations c join public.slots s on s.id=c.slot_id join public.profiles p on p.id=c.patient_id
   where(v_staff or c.patient_id=v_user) and s.starts_at>=v_start and s.starts_at<v_end and(v_service is null or s.service_id=v_service)
   order by c.released_at desc,c.id offset v_offset limit v_limit)q;
 end if;
 if v_reporter then
  v_report:=public.get_report(v_from,v_to,v_service);
  select coalesce(jsonb_agg(q.row order by q.created_at desc),'[]') into v_audit from (
   select case when v_role='supervisor' then jsonb_build_object('id',l.id,'event',l.event,'created_at',l.created_at,'detail','Registro agregado; identidad restringida') else to_jsonb(l) end as row,l.created_at
   from public.audit_log l where l.created_at>=v_start and l.created_at<v_end order by l.created_at desc,l.id offset v_offset limit v_limit)q;
 end if;
 return jsonb_build_object(
 'user',(select to_jsonb(p)||jsonb_build_object('email',(select u.email from auth.users u where u.id=v_user)) from public.profiles p where p.id=v_user),
 'center',(select to_jsonb(c) from public.medical_centers c order by c.id limit 1),'settings',(select config from public.system_settings where id=1),
 'services',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from public.services order by name limit 100)x),
 'rooms',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from public.rooms order by name limit 100)x),
 'professionals',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from public.professionals order by full_name limit 100)x),
 'profiles',v_profiles,'slots',v_slots,'available',v_available,'appointments',v_appts,'waiting',v_wait,'offers',v_offers,
 'notifications',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from(select id,kind,title,body,created_at,read_at,appointment_id,offer_id from public.notifications where patient_id=v_user order by created_at desc,id offset v_offset limit v_limit)x),
 'unread_notifications',(select count(*) from public.notifications where patient_id=v_user and read_at is null),
 'appointment_events',v_events,'audit_log',v_audit,'cancellations',v_cancel,
 'schedule_exceptions',case when v_staff then(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from public.schedule_exceptions where starts_at<v_end and ends_at>v_start order by starts_at offset v_offset limit v_limit)x) else '[]'::jsonb end,
 'schedules',case when v_staff then(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select * from public.schedules order by weekday,start_time offset v_offset limit v_limit)x) else '[]'::jsonb end,
 'report',v_report,'pagination',jsonb_build_object('offset',v_offset,'limit',v_limit,'total',v_total,'has_more',v_offset+v_limit<v_total),
 'independent',true,'generated_at',now());
 end$$;

create function public.run_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$declare v_run bigint;v_expired integer;v_reminders integer:=0;v_n uuid;r record;begin
 -- This function is intentionally NOT granted to authenticated/anon. Cron calls as postgres.
 perform app_private.lock_schedule();insert into public.system_runs(name) values('maintenance') returning id into v_run;
 v_expired:=app_private.expire_offers();
 for r in select a.id,a.patient_id,h.value::text::integer as hours from public.appointments a join public.slots s on s.id=a.slot_id join public.profiles p on p.id=a.patient_id cross join lateral jsonb_array_elements(p.preferences->'reminder_hours')h
 where a.status in ('reserved','confirmed') and s.starts_at>now() and s.starts_at<=now()+h.value::text::integer*interval '1 hour'
 and a.created_at<=s.starts_at-h.value::text::integer*interval '1 hour'
 loop
  v_n:=app_private.notify(r.patient_id,'reminder','Recuerda revisar tu próxima atención','Tienes una atención programada en Medicita Contigo. Revisa los detalles o avisa si no podrás asistir.',r.id,null,'reminder:'||r.id||':'||r.hours);
  if v_n is not null then v_reminders:=v_reminders+1;end if;
 end loop;
 update public.system_runs set finished_at=now(),summary=jsonb_build_object('expired_offers',v_expired,'internal_reminders',v_reminders) where id=v_run;
 return jsonb_build_object('expired_offers',v_expired,'internal_reminders',v_reminders,'external_messages_sent',0);
 end$$;

-- Explicit API allowlist; default PUBLIC execute is revoked for every new function.
-- Only actor_role is callable from RLS as the user's role; all other helpers stay private.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.actor_role() to authenticated;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['book_slot','change_appointment','register_arrival','set_room','create_slot','join_waitlist','leave_waitlist','compatible_candidates','make_offer','respond_offer','withdraw_offer','save_profile','set_user_role','mark_notification','admin_message','save_resource','get_report','get_snapshot','run_maintenance']) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.signature::text not like '%run_maintenance%' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.run_maintenance() to service_role;end if;
end$$;
commit;
