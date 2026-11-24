-- A separate registry containing fabricated JSON, never real Auth/agenda rows.
-- The fixed generator cannot accept names, emails, account IDs or arbitrary payloads.
create table public.demonstration_sets(
 tag text primary key check(tag='medicita-december-2026-v1'),
 template jsonb not null check(template->>'is_demo'='true' and template->>'dataset_tag'=tag),
 payload jsonb not null check(payload->>'is_demo'='true' and payload->>'dataset_tag'=tag),
 active boolean not null default true,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.demonstration_sets enable row level security;
revoke all on public.demonstration_sets from public,anon,authenticated;
grant select on public.demonstration_sets to authenticated;
create policy demonstration_sets_admin_read on public.demonstration_sets for select to authenticated using((select app_private.actor_role())='admin');

create function app_private.build_demo_december_dataset(p_as_of timestamptz default '2026-11-24T12:00:00Z') returns jsonb language plpgsql immutable set search_path='' as $demo$
declare
 tag constant text:='medicita-december-2026-v1'; marker jsonb:=jsonb_build_object('is_demo',true,'dataset_tag','medicita-december-2026-v1');
 names text[]:=array['Ana','Luis','Camila','Diego','Elena','Felipe','Gabriela','Hugo','Isabel','Javier','Karla','León','María','Nicolás','Olivia','Pablo','Rosa','Sergio','Teresa','Víctor'];
 ids text[]:=array['general','dental','nursing','midwife','kine']; labels text[]:=array['Medicina general','Odontología','Enfermería','Matronería','Kinesiología']; mapping int[]:=array[0,0,1,1,2,2,3,4]; profservices int[]:=array[0,0,1,1,2,2,3,4,0,1,2,3];
 avatars text[]:=array['heart','crown','leaf','sun','star','flower','contigo']; counts int[]:=array[120,126,114]; historical int[]:=array[20,10,5,3,1];
 profiles jsonb:='[]'; services jsonb:='[]'; rooms jsonb:='[]'; professionals jsonb:='[]'; schedules jsonb:='[]'; slots jsonb:='[]'; appointments jsonb:='[]'; cancellations jsonb:='[]'; events jsonb:='[]'; notifications jsonb:='[]'; waiting jsonb:='[]'; offers jsonb:='[]';
 i int; d int; r int; q int; n int; si int; pi int; minute_of_day int; booked int; idx int; day date; start_at timestamptz; end_at timestamptz; patient text; slotid text; bookingid text; status text; x jsonb; a jsonb; c jsonb; roomid text; replacement int; created text:=to_char(p_as_of at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 for i in 0..119 loop
  patient:=case when i=0 then 'patient-a' when i=1 then 'patient-b' else 'demo-patient-'||lpad((i+1)::text,3,'0') end;
  profiles:=profiles||jsonb_build_array(marker||jsonb_build_object('id',patient,'full_name',names[i%20+1],'last_name','Ejemplo '||lpad((i+1)::text,3,'0'),'email','paciente-'||(i+1)||'@example.invalid','phone','','role','patient','onboarded',i%3<>0,'preferences',jsonb_build_object('simple_mode',false,'high_contrast',false,'reduce_motion',false,'reminder_hours',jsonb_build_array(48,24,2),'receive_offers',true,'visual_mode',i%7=0,'vibration_enabled',false),'created_at','2024-01-01T12:00:00.000Z','updated_at',created,'community_opt_in',i<12,'community_alias',names[i%20+1]||' del jardín','community_avatar',avatars[i%7+1]));
 end loop;
 for i in 1..3 loop
  patient:=(array['admin','reception','supervisor'])[i];
  profiles:=profiles||jsonb_build_array(marker||jsonb_build_object('id',patient,'full_name',(array['Administración ficticia','Recepción ficticia','Supervisión ficticia'])[i],'last_name','Demo','email',patient||'@example.invalid','phone','','role',patient,'onboarded',true,'preferences',jsonb_build_object('simple_mode',false,'high_contrast',false,'reduce_motion',false,'reminder_hours',jsonb_build_array(48,24,2),'receive_offers',true),'created_at','2024-01-01T12:00:00.000Z'));
 end loop;
 for i in 1..5 loop services:=services||jsonb_build_array(marker||jsonb_build_object('id','service-'||ids[i],'name',labels[i],'duration_minutes',30,'active',true));end loop;
 for i in 0..7 loop si:=mapping[i+1]+1;rooms:=rooms||jsonb_build_array(marker||jsonb_build_object('id','demo-room-'||(i+1),'name','Box '||(i+1),'service_id','service-'||ids[si],'specialty',labels[si],'status','free','active',true,'updated_at',created));end loop;
 for i in 0..11 loop professionals:=professionals||jsonb_build_array(marker||jsonb_build_object('id','demo-professional-'||(i+1),'full_name','Profesional ficticio '||lpad((i+1)::text,2,'0'),'service_id','service-'||ids[profservices[i+1]+1],'active',true));end loop;
 for r in 0..7 loop for d in 4..6 loop for q in 0..1 loop
  pi:=case when q=1 then case r when 0 then 8 when 3 then 9 when 5 then 10 when 6 then 11 else r end else r end;
  schedules:=schedules||jsonb_build_array(marker||jsonb_build_object('id','schedule-'||r||'-'||d||'-'||case q when 0 then 'morning' else 'afternoon' end,'room_id','demo-room-'||(r+1),'professional_id','demo-professional-'||(pi+1),'weekday',d,'start_time',case q when 0 then '08:00' else '14:00' end,'end_time',case q when 0 then '13:00' else '20:00' end,'active',true));
 end loop;end loop;end loop;
 for d in 0..2 loop day:='2026-12-03'::date+d;booked:=0;
  for q in 0..21 loop for r in 0..7 loop
   minute_of_day:=480+q*30+case when q>=10 then 60 else 0 end;pi:=case when q>=10 then case r when 0 then 8 when 3 then 9 when 5 then 10 when 6 then 11 else r end else r end;si:=mapping[r+1]+1;idx:=q*8+r;
   start_at:=(day::timestamp+minute_of_day*interval '1 minute') at time zone 'America/Santiago';end_at:=start_at+interval '30 minutes';slotid:='demo-slot-'||day||'-'||lpad((idx+1)::text,3,'0');
   x:=marker||jsonb_build_object('id',slotid,'dataset_section','december','room_id','demo-room-'||(r+1),'professional_id','demo-professional-'||(pi+1),'service_id','service-'||ids[si],'specialty',labels[si],'professional','Profesional ficticio '||lpad((pi+1)::text,2,'0'),'starts_at',start_at,'ends_at',end_at,'duration_minutes',30,'blocked',false,'created_at',created);slots:=slots||jsonb_build_array(x);
   if ((idx+1)*counts[d+1])/176>(idx*counts[d+1])/176 then
    patient:=profiles->((booked+d*37)%120)->>'id';bookingid:='demo-booking-'||day||'-'||lpad((booked+1)::text,3,'0');status:=case when booked%3=0 then 'reserved' else 'confirmed' end;
    appointments:=appointments||jsonb_build_array(marker||jsonb_build_object('id',bookingid,'care_process_id',bookingid,'slot_id',slotid,'patient_id',patient,'status',status,'checkin_token','credential-'||bookingid,'created_at','2026-11-10T12:00:00.000Z','confirmed_at',case when status='confirmed' then '2026-11-24T11:00:00.000Z' end,'arrived_at',null,'completed_at',null,'cancelled_at',null,'no_show_at',null,'cancellation_reason',null,'released_at',null));booked:=booked+1;
   end if;
  end loop;end loop;
 end loop;
 for i in 0..4 loop for n in 0..historical[i+1]-1 loop
  day:='2026-11-20'::date-(i*25+n)*2;start_at:=(day::timestamp+interval '10 hours') at time zone 'America/Santiago';end_at:=start_at+interval '30 minutes';slotid:='demo-history-slot-'||i||'-'||n;bookingid:='demo-history-booking-'||i||'-'||n;patient:=profiles->i->>'id';
  x:=marker||jsonb_build_object('id',slotid,'dataset_section','history','room_id','demo-room-1','professional_id','demo-professional-1','service_id','service-general','specialty','Medicina general','professional','Profesional ficticio 01','starts_at',start_at,'ends_at',end_at,'duration_minutes',30,'blocked',false,'created_at',start_at-interval '8 days');slots:=slots||jsonb_build_array(x);
  a:=marker||jsonb_build_object('id',bookingid,'care_process_id',bookingid,'slot_id',slotid,'patient_id',patient,'status','completed','checkin_token','credential-'||bookingid,'created_at',start_at-interval '7 days','confirmed_at',start_at-interval '6 days','arrived_at',start_at-interval '5 minutes','completed_at',end_at,'cancelled_at',null,'no_show_at',null,'cancellation_reason',null,'released_at',null,'validated_by','reception');appointments:=appointments||jsonb_build_array(a);
  events:=events||jsonb_build_array(marker||jsonb_build_object('id','history-complete-'||i||'-'||n,'appointment_id',bookingid,'slot_id',slotid,'patient_id',patient,'actor_id','reception','event','completed','created_at',end_at,'detail','Atención histórica ficticia validada por recepción'));
 end loop;end loop;
 i:=0;
 for x in select v from jsonb_array_elements(slots) with ordinality entries(v,position) where v->>'dataset_section'='december' and not exists(select 1 from jsonb_array_elements(appointments) b where b->>'slot_id'=v->>'id') order by position limit 6 loop
  patient:=profiles->(110+i)->>'id';bookingid:='demo-cancelled-'||(i+1);slotid:=x->>'id';
  a:=marker||jsonb_build_object('id',bookingid,'care_process_id',bookingid,'slot_id',slotid,'patient_id',patient,'status','cancelled','checkin_token','credential-'||bookingid,'created_at','2026-11-10T12:00:00.000Z','confirmed_at',null,'arrived_at',null,'completed_at',null,'cancelled_at','2026-11-23T12:00:00.000Z','no_show_at',null,'cancellation_reason','Cambio de horario ficticio','released_at','2026-11-23T12:00:00.000Z');appointments:=appointments||jsonb_build_array(a);
  cancellations:=cancellations||jsonb_build_array(marker||jsonb_build_object('id','demo-cancellation-'||(i+1),'appointment_id',bookingid,'slot_id',slotid,'patient_id',patient,'released_at','2026-11-23T12:00:00.000Z','reason','Cambio de horario ficticio','notice_minutes',floor(extract(epoch from ((x->>'starts_at')::timestamptz-'2026-11-23T12:00:00Z'::timestamptz))/60),'reassigned_at',null,'used_at',null));i:=i+1;
 end loop;
 for i in 1..3 loop
  idx:=(array[6,7,10])[i];si:=(array[1,2,4])[i];slotid:='demo-slot-2026-12-03-'||lpad((array[1,4,7])[i]::text,3,'0');patient:='demo-patient-'||lpad(idx::text,3,'0');bookingid:='demo-booking-2026-12-03-'||lpad(idx::text,3,'0');
  waiting:=waiting||jsonb_build_array(marker||jsonb_build_object('id','demo-wait-'||i,'patient_id',patient,'service_id','service-'||ids[si],'specialty',labels[si],'earliest','2026-12-03T03:00:00.000Z','latest','2026-12-06T02:59:00.000Z','preferred_days',jsonb_build_array(4,5,6),'preferred_period','any','old_appointment_id',bookingid,'receive_offers',true,'created_at','2026-11-22T12:00:00.000Z'));
  offers:=offers||jsonb_build_array(marker||jsonb_build_object('id','demo-offer-'||i,'patient_id',patient,'slot_id',slotid,'old_appointment_id',bookingid,'status','pending','created_at',created,'expires_at',least(p_as_of+interval '24 hours','2026-12-03T11:00:00Z'::timestamptz),'responded_at',null));
 end loop;
 for x in select v from jsonb_array_elements(profiles) v loop patient:=x->>'id';notifications:=notifications||jsonb_build_array(marker||jsonb_build_object('id','demo-welcome-'||patient,'patient_id',patient,'kind','welcome','title','Demostración ficticia','body','Este personaje, sus horas y sus coronitas son datos de prueba.','created_at',created,'read_at',null,'appointment_id',null,'offer_id',null,'dedupe_key','demo-welcome-'||patient));end loop;
 return marker||jsonb_build_object('version',2,'revision',0,'clock_offset_ms',0,'label','Demostración ficticia · diciembre de 2026','timezone','America/Santiago','demonstration',true,'created_at',created,'center',marker||jsonb_build_object('id','center-demo-december','name','Centro ficticio Medicita Contigo','address','Datos de prueba · sin vínculo institucional','independent',true),'settings',jsonb_build_object('cancellation_notice_minutes',0,'no_show_grace_minutes',15,'offer_minutes',1440,'early_cancellation_hours',24),'profiles',profiles,'services',services,'rooms',rooms,'professionals',professionals,'schedules',schedules,'slots',slots,'appointments',appointments,'waiting',waiting,'offers',offers,'notifications',notifications,'notification_deliveries','[]'::jsonb,'appointment_events',events,'cancellations',cancellations,'schedule_exceptions','[]'::jsonb,'audit_log',jsonb_build_array(marker||jsonb_build_object('id','demo-dataset-created','actor_id','admin','event','demo_dataset_created','created_at',created,'detail','Conjunto exclusivamente ficticio, aislado de cuentas y agendas reales')));
end $demo$;

-- Public reads are a fixed fictitious generator only. No caller-supplied JSON is
-- ever returned; the registry has no public INSERT/UPDATE/DELETE privilege.
create function public.get_demo_dataset(p_tag text default 'medicita-december-2026-v1') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_tag is distinct from 'medicita-december-2026-v1' then raise exception 'El conjunto de demostración solicitado no existe';end if;
 select payload into result from public.demonstration_sets where tag=p_tag and active;
 return result;
end $$;
create function public.manage_demo_dataset(p_action text,p_tag text default 'medicita-december-2026-v1') returns jsonb language plpgsql security definer set search_path='' as $$
declare fresh jsonb;current_revision integer;
begin
 perform app_private.require_admin();
 if p_tag is distinct from 'medicita-december-2026-v1' or p_action not in('reset','retire') then raise exception 'Selecciona el conjunto ficticio y una acción válida';end if;
 if p_action='reset' then
  fresh:=app_private.build_demo_december_dataset(now());
  insert into public.demonstration_sets(tag,template,payload,active) values(p_tag,fresh,fresh,true) on conflict(tag) do update set template=excluded.template,payload=excluded.payload,active=true,revision=demonstration_sets.revision+1,updated_at=now() returning revision into current_revision;
 else
  update public.demonstration_sets set active=false,revision=revision+1,updated_at=now() where tag=p_tag returning revision into current_revision;
 end if;
 perform app_private.log_event('demo_dataset_'||p_action,null,null,null,'Conjunto ficticio: '||p_tag||'. Revisión '||coalesce(current_revision,0));
 return jsonb_build_object('tag',p_tag,'action',p_action,'revision',current_revision,'is_demo',true);
end $$;
revoke all on function app_private.build_demo_december_dataset(timestamptz) from public,anon,authenticated;
revoke all on function public.get_demo_dataset(text) from public;
revoke all on function public.manage_demo_dataset(text,text) from public,anon;
grant execute on function public.get_demo_dataset(text) to anon,authenticated;
grant execute on function public.manage_demo_dataset(text,text) to authenticated;

insert into public.demonstration_sets(tag,template,payload,active)
select 'medicita-december-2026-v1',d,d,true from(select app_private.build_demo_december_dataset('2026-11-24T12:00:00Z') d) fixture on conflict(tag) do nothing;
