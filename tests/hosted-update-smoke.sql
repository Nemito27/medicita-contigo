-- Run only against the independent Medicita Contigo project, after its three
-- 2026-11-24 migrations. Every fixture and preference/configuration change is
-- rolled back. No Auth API, email, SMS, external delivery or schema DDL is used.
-- PostgreSQL identity sequences may have harmless gaps after rollback.
begin;
set local statement_timeout='45s';
do $smoke$
<<smoke>>
declare
 admin_id uuid;
 patient_a uuid:=gen_random_uuid();patient_b uuid:=gen_random_uuid();
 room_id uuid:=gen_random_uuid();professional_id uuid:=gen_random_uuid();service_id uuid;
 future_slot_1 uuid:=gen_random_uuid();future_slot_2 uuid:=gen_random_uuid();past_slot uuid:=gen_random_uuid();
 future_a uuid;future_b uuid;past_a uuid:=gen_random_uuid();call_id uuid;request_id uuid:=gen_random_uuid();
 comment_id uuid;html_id uuid;reply_id uuid;adjustment_id uuid;
 initial_profiles bigint;initial_slots bigint;initial_appointments bigint;
 current_day date:=(now() at time zone 'America/Santiago')::date;
 value jsonb;other jsonb;item jsonb;payload jsonb;reset_payload jsonb;
 before_history jsonb;credit_id uuid;care_id uuid;
 denied boolean;message text;n bigint;seed_rows bigint;day_value text;
begin
 select id into admin_id from public.profiles where role='admin' order by id limit 1;
 if admin_id is null then raise exception 'Smoke requires an existing administrator';end if;
 select id into service_id from public.services where active and name='Medicina general' order by id limit 1;
 if service_id is null then raise exception 'Smoke requires the existing general medicine service';end if;
 select count(*) into initial_profiles from public.profiles;
 select count(*) into initial_slots from public.slots;
 select count(*) into initial_appointments from public.appointments;
 if exists(select 1 from public.profiles p where(select count(*) from public.reward_ledger l where l.user_id=p.id and l.action='welcome')<>1)
 or exists(select 1 from public.reward_ledger where action='welcome' and amount<>5) then raise exception 'Existing welcome backfill is not exactly five once per person';end if;

 -- Only temporary, randomly named identities, never reusable credentials.
 insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
 (patient_a,'medicita-smoke-'||patient_a||'@example.invalid','{"given_name":"Persona ficticia A"}',now(),now()),
 (patient_b,'medicita-smoke-'||patient_b||'@example.invalid','{"given_name":"Persona ficticia B"}',now(),now());
 if(select count(*) from public.profiles where id in(patient_a,patient_b))<>2 then raise exception 'New Auth identities did not bootstrap their profiles';end if;
 perform app_private.reward_welcome(patient_a);perform app_private.reward_welcome(patient_a);
 if app_private.reward_balance(patient_a)<>5 or(select count(*) from public.reward_ledger where user_id=patient_a and action='welcome')<>1 then raise exception 'Welcome retry duplicated the benefit';end if;

 -- Dedicated resources and local-day fixtures; real agenda rows stay unchanged.
 insert into public.rooms(id,name,specialty,status) values(room_id,'Box ficticio smoke '||left(room_id::text,8),'Medicina general','free');
 insert into public.professionals(id,full_name,service_id) values(professional_id,'Profesional ficticio smoke '||left(professional_id::text,8),service_id);
 insert into public.slots(id,room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) values
 (future_slot_1,room_id,professional_id,service_id,((current_day+2)::timestamp+interval '15 hours') at time zone 'America/Santiago',((current_day+2)::timestamp+interval '15 hours 30 minutes') at time zone 'America/Santiago',30),
 (future_slot_2,room_id,professional_id,service_id,((current_day+2)::timestamp+interval '16 hours') at time zone 'America/Santiago',((current_day+2)::timestamp+interval '16 hours 30 minutes') at time zone 'America/Santiago',30),
 (past_slot,room_id,professional_id,service_id,current_day::timestamp at time zone 'America/Santiago',(current_day::timestamp+interval '30 minutes') at time zone 'America/Santiago',30);
 insert into public.appointments(id,slot_id,patient_id) values(past_a,past_slot,patient_a);

 perform set_config('request.jwt.claim.sub',patient_a::text,true);execute 'set local role authenticated';
 value:=public.get_my_rewards();if(value->>'balance')::integer<>5 then raise exception 'Recipient own reward read is incorrect';end if;
 perform public.save_accessibility_preferences('{"visual_mode":true,"vibration_enabled":true}');
 if(select onboarded from public.profiles where id=patient_a) or(public.get_my_rewards()->>'balance')::integer<>5 then raise exception 'Accessibility preference incorrectly completed profile or earned points';end if;
 perform public.save_profile('Persona ficticia A','','','{"visual_mode":true}');
 perform public.save_profile('Persona ficticia A','','','{"visual_mode":true}');
 if(public.get_my_rewards()->>'balance')::integer<>8 then raise exception 'Profile benefit is not exactly three once';end if;
 denied:=false;begin perform public.adjust_coronitas(patient_a,100,'Intento no autorizado de prueba');exception when insufficient_privilege or raise_exception then denied:=true;end;
 if not denied then raise exception 'Patient adjusted their own balance';end if;
 denied:=false;begin perform public.get_reward_history(patient_b);exception when insufficient_privilege or raise_exception then denied:=true;end;
 if not denied then raise exception 'Patient accessed another reward history';end if;
 denied:=false;begin update public.reward_ledger set amount=999 where user_id=patient_a;exception when insufficient_privilege or raise_exception then denied:=true;end;
 if not denied then raise exception 'Browser role has direct ledger write privilege';end if;
 if(select count(*) from public.reward_ledger where user_id=patient_b)<>0 then raise exception 'Reward ledger RLS exposed another person';end if;

 future_a:=public.book_slot(future_slot_1,null);
 if(public.get_my_rewards()->>'balance')::integer<>8 then raise exception 'Reservation incorrectly paid a reward';end if;
 perform public.change_appointment(future_a,'confirm',null);
 denied:=false;begin perform public.change_appointment(future_a,'confirm',null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Duplicate confirmation accepted an invalid transition';end if;
 future_b:=public.book_slot(future_slot_2,future_a);perform public.change_appointment(future_b,'confirm',null);
 if(public.get_my_rewards()->>'balance')::integer<>10 then raise exception 'Rescheduling farmed repeated confirmation rewards';end if;
 select care_process_id into care_id from public.appointments where id=future_a;
 if care_id is distinct from(select care_process_id from public.appointments where id=future_b) then raise exception 'Reschedule lost care-process identity';end if;
 perform public.save_community_preferences(true,'Persona de prueba','leaf');
 value:=public.get_reward_community();
 for item in select x from jsonb_array_elements(value->'items')x loop
  if exists(select 1 from jsonb_object_keys(item)k where k not in('alias','avatar','balance','level','is_self')) then raise exception 'Community output contains private fields';end if;
 end loop;
 perform public.save_community_preferences(false,'','contigo');

 -- Moderation checks precede cooldown and must reject before row insertion.
 comment_id:=public.post_room_comment(room_id,'Mi computador está disponible',null,'Persona amable');
 denied:=false;begin perform public.post_room_comment(room_id,'Otro texto respetuoso',null,'Persona amable');exception when raise_exception then get stacked diagnostics message=message_text;denied:=position('30 segundos' in message)>0;end;
 if not denied then raise exception 'Comment cooldown was not enforced';end if;
 foreach day_value in array array['WEON','w e o n','w3oooon','c0nch3tum4dre','m!erda','q l o'] loop
  denied:=false;begin perform public.post_room_comment(room_id,day_value,null,'Persona amable');exception when raise_exception then get stacked diagnostics message=message_text;denied:=position('respeto' in message)>0;end;
  if not denied then raise exception 'Configured offensive-content evasion was not rejected';end if;
 end loop;
 denied:=false;begin perform public.post_room_comment(room_id,repeat('a',501),null,'Persona amable');exception when raise_exception then get stacked diagnostics message=message_text;denied:=position('500' in message)>0;end;
 if not denied then raise exception 'Server comment length limit was not enforced';end if;
 if(public.get_my_rewards()->>'balance')::integer<>10 then raise exception 'Comments unexpectedly awarded coronitas';end if;
 denied:=false;begin perform public.call_to_box(past_a,request_id);exception when insufficient_privilege or raise_exception then denied:=true;end;
 if not denied then raise exception 'Patient called themselves to a box';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if(select count(*) from public.room_comments where author_id=patient_a)<>1 then raise exception 'Rejected comments reached persistence';end if;
 update public.room_comments set created_at=now()-interval '2 minutes' where id=comment_id;

 perform set_config('request.jwt.claim.sub',patient_a::text,true);execute 'set local role authenticated';
 html_id:=public.post_room_comment(room_id,repeat('a',500),null,'Persona amable');
 if(select length(body) from public.room_comments where id=html_id)<>500 then raise exception 'Valid 500-character comment was not preserved';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 update public.room_comments set created_at=now()-interval '2 minutes' where id=html_id;
 perform set_config('request.jwt.claim.sub',patient_a::text,true);execute 'set local role authenticated';
 denied:=false;begin perform public.post_room_comment(room_id,repeat('A',500),null,'Persona amable');exception when raise_exception then get stacked diagnostics message=message_text;denied:=position('repetidamente' in message)>0;end;
 if not denied then raise exception 'Canonical duplicate comment was not rejected';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);

 perform set_config('request.jwt.claim.sub',patient_b::text,true);execute 'set local role authenticated';
 html_id:=public.post_room_comment(room_id,'<img src=x onerror="alert(1)"><script>alert(2)</script>',null,'Otra persona');
 denied:=false;begin perform public.edit_room_comment(comment_id,'Cambio ajeno');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Another author edited a comment';end if;
 perform public.report_room_comment(comment_id,'Solicito revisión manual');perform public.report_room_comment(comment_id,'Reintento del mismo reporte');
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if(select count(*) from public.room_comment_reports r where r.comment_id=smoke.comment_id and r.reporter_id=patient_b)<>1 then raise exception 'Report retry duplicated a report';end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);execute 'set local role authenticated';
 value:=public.get_people_rewards('Persona ficticia','','crowns_desc',0,100);
 if not exists(select 1 from jsonb_array_elements(value->'items')x where x->>'id'=patient_a::text and(x->>'balance')::integer=10 and x->>'is_demo'='false') then raise exception 'Administrator reward view cannot find registered fixture';end if;
 value:=public.get_comment_moderation('reported',0,50);
 if not exists(select 1 from jsonb_array_elements(value->'items')x where x->>'id'=comment_id::text) then raise exception 'Report is missing from manual review';end if;
 perform public.moderate_room_comment(comment_id,'hidden','Revisión administrativa de prueba');
 perform public.moderate_room_comment(comment_id,'published','Texto inocente revisado por el equipo');
 reply_id:=public.post_room_comment(room_id,'La sala está señalizada al ingreso',comment_id,null);
 denied:=false;begin perform public.call_to_box(past_a,request_id);exception when raise_exception then get stacked diagnostics message=message_text;denied:=position('llegada registrada' in message)>0;end;
 if not denied then raise exception 'Staff called an appointment without arrival';end if;
 perform public.register_arrival(null,past_a);
 call_id:=public.call_to_box(past_a,request_id);
 if public.call_to_box(past_a,request_id)<>call_id or public.call_to_box(past_a,gen_random_uuid())<>call_id then raise exception 'Call retries did not dedupe';end if;
 denied:=false;begin perform public.respond_box_call(call_id,'understood');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Staff responded on behalf of the recipient';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if(select count(*) from public.notifications where box_call_id=call_id)<>1 or(select count(*) from public.box_calls where appointment_id=past_a)<>1 then raise exception 'Call notification or event was duplicated';end if;
 if exists(select 1 from public.notification_deliveries d join public.notifications n on n.id=d.notification_id where n.box_call_id=call_id and d.channel<>'internal') then raise exception 'Smoke call attempted external delivery';end if;

 perform set_config('request.jwt.claim.sub',patient_b::text,true);execute 'set local role authenticated';
 value:=public.get_box_calls(true);
 if exists(select 1 from jsonb_array_elements(value)x where x->>'id'=call_id::text) or(select count(*) from public.box_calls where id=call_id)<>0 then raise exception 'Private call leaked to another person';end if;
 denied:=false;begin perform public.respond_box_call(call_id,'help');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Another person responded to a call';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);execute 'set local role anon';
 value:=public.get_public_box_calls(room_id);
 if jsonb_array_length(value)<>1 then raise exception 'Public turn feed is missing the active fixture call';end if;
 for item in select x from jsonb_array_elements(value)x loop
  if exists(select 1 from jsonb_object_keys(item)k where k not in('turn_code','room_name','created_at','status')) or item->>'status'<>'calling' or item->>'turn_code'!~'^T-[A-F0-9]{10}$' then raise exception 'Public room feed is not minimal and opaque';end if;
 end loop;
 denied:=false;begin perform public.get_room_comments(room_id,0,20);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous caller accessed authenticated comments';end if;
 denied:=false;begin perform public.get_my_rewards();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous caller accessed reward history';end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',patient_a::text,true);execute 'set local role authenticated';
 value:=public.get_box_calls(true);
 if not exists(select 1 from jsonb_array_elements(value)x where x->>'id'=call_id::text and x->>'status'='pending') then raise exception 'Recipient cannot recover their pending call';end if;
 perform public.respond_box_call(call_id,'received');perform public.respond_box_call(call_id,'received');
 perform public.respond_box_call(call_id,'help');perform public.respond_box_call(call_id,'received');
 value:=public.get_box_calls(true);
 if not exists(select 1 from jsonb_array_elements(value)x where x->>'id'=call_id::text and x->>'status'='help' and x->>'received_at' is not null and x->>'responded_at' is not null) then raise exception 'Receipt and help did not persist';end if;
 perform public.respond_box_call(call_id,'understood');
 if exists(select 1 from jsonb_array_elements(public.get_box_calls(true))x where x->>'id'=call_id::text) then raise exception 'Understood call remained in pending recipient feed';end if;
 value:=public.get_room_comments(room_id,0,20);
 if not exists(select 1 from jsonb_array_elements(value->'items')x where x->>'id'=html_id::text and x->>'body'='<img src=x onerror="alert(1)"><script>alert(2)</script>') then raise exception 'Untrusted text was not preserved as plain comment data';end if;
 if not exists(select 1 from jsonb_array_elements(value->'items')x cross join lateral jsonb_array_elements(x->'replies')r where r->>'id'=reply_id::text and r->>'is_staff'='true' and r->>'alias'='Equipo Medicita') then raise exception 'Staff reply identity is incorrect';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);

 perform set_config('request.jwt.claim.sub',admin_id::text,true);execute 'set local role authenticated';
 value:=public.get_box_calls(true);
 if not exists(select 1 from jsonb_array_elements(value)x where x->>'id'=call_id::text and x->>'status'='understood') then raise exception 'Staff did not receive the patient response';end if;
 perform public.change_appointment(past_a,'complete',null);
 value:=public.get_reward_history(patient_a,0,100);
 select(x->>'id')::uuid into credit_id from jsonb_array_elements(value->'items')x where x->>'action'='attendance' and x->>'correctable'='true';
 if credit_id is null then raise exception 'Attendance did not produce a correctable ledger credit';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if app_private.reward_balance(patient_a)<>20 or(select count(*) from public.attendance_validations where patient_id=patient_a and active)<>1 or(select closed_at from public.box_calls where id=call_id)is null then raise exception 'Completion did not atomically reward, validate and close call';end if;
 select jsonb_agg(to_jsonb(l)order by l.created_at,l.id) into before_history from public.reward_ledger l where user_id=patient_a;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);execute 'set local role authenticated';
 perform public.correct_attendance(past_a,'Validación ingresada por error en la prueba');
 perform public.save_reward_rule('attendance',12,'Comprobar que revalidar conserva el importe original');
 perform public.change_appointment(past_a,'complete',null);
 perform public.correct_attendance(past_a,'Segunda corrección de prueba controlada');
 perform public.change_appointment(past_a,'complete',null);
 perform public.save_reward_rule('attendance',10,'Restaurar la regla inicial dentro de la prueba');
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if app_private.reward_balance(patient_a)<>20 or(select count(*) from public.attendance_validations where patient_id=patient_a and active)<>1 then raise exception 'Revalidation farmed net rewards or validations';end if;
 if(select count(*) from public.reward_ledger where user_id=patient_a and action='attendance_correction' and amount=-10)<>2 or not exists(select 1 from public.reward_ledger where id=credit_id and amount=10) then raise exception 'Corrections did not preserve and reverse the original ledger';end if;
 if exists(select 1 from jsonb_array_elements(before_history)x where not exists(select 1 from public.reward_ledger l where l.id=(x->>'id')::uuid and to_jsonb(l)=x)) then raise exception 'An original ledger row was changed';end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);execute 'set local role authenticated';
 adjustment_id:=public.adjust_coronitas(patient_a,1,'Ajuste administrativo explícito de prueba');
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if app_private.reward_balance(patient_a)<>21 or not exists(select 1 from public.reward_ledger where id=adjustment_id and actor_id=admin_id and reason='Ajuste administrativo explícito de prueba') then raise exception 'Reasoned adjustment was not auditable';end if;

 -- Registry resets never insert fake identities or appointments into real tables.
 select count(*) into seed_rows from public.demonstration_sets where tag='medicita-december-2026-v1';
 if seed_rows<>1 then raise exception 'Demonstration registry is not a single idempotent row';end if;
 execute 'set local role anon';payload:=public.get_demo_dataset('medicita-december-2026-v1');execute 'reset role';
 if payload is null or payload->>'is_demo'<>'true' or jsonb_array_length(payload->'rooms')<>8 or jsonb_array_length(payload->'professionals')<>12 then raise exception 'Anonymous fictitious dataset is unavailable or incoherent';end if;
 if(select count(*) from jsonb_array_elements(payload->'profiles')x where x->>'role'='patient')<>120 then raise exception 'Dataset does not contain 120 fictional patients';end if;
 foreach day_value in array array['2026-12-03','2026-12-04','2026-12-05'] loop
  if(select count(*) from jsonb_array_elements(payload->'slots')x where x->>'dataset_section'='december' and((x->>'starts_at')::timestamptz at time zone 'America/Santiago')::date=day_value::date)<>176 then raise exception 'Dataset does not contain 176 slots per December day';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',patient_a::text,true);execute 'set local role authenticated';
 denied:=false;begin perform public.manage_demo_dataset('retire','medicita-december-2026-v1');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Patient retired the demo registry';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub',admin_id::text,true);execute 'set local role authenticated';
 perform public.manage_demo_dataset('reset','medicita-december-2026-v1');reset_payload:=public.get_demo_dataset('medicita-december-2026-v1');
 perform public.manage_demo_dataset('reset','medicita-december-2026-v1');
 if public.get_demo_dataset('medicita-december-2026-v1')is distinct from reset_payload then raise exception 'Repeat reset duplicated or changed a fixed-as-of dataset';end if;
 perform public.manage_demo_dataset('retire','medicita-december-2026-v1');
 if public.get_demo_dataset('medicita-december-2026-v1')is not null then raise exception 'Retired dataset remains available';end if;
 perform public.manage_demo_dataset('reset','medicita-december-2026-v1');
 execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if(select count(*) from public.profiles)<>initial_profiles+2 or(select count(*) from public.slots)<>initial_slots+3 or(select count(*) from public.appointments)<>initial_appointments+3 then raise exception 'Registry operation affected real agenda tables';end if;
 if(select count(*) from public.demonstration_sets where tag='medicita-december-2026-v1')<>1 then raise exception 'Registry reset duplicated the dataset';end if;
end
$smoke$;
rollback;
select jsonb_build_object('result','hosted_update_smoke_passed','rolled_back',true,'checks',array['welcome/profile/confirmation/revalidation','ledger permissions and audit','comment moderation/privacy/limits','private calls/public screen/response','isolated December registry reset/retire']) as verification;
