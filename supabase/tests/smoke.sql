-- Installed-backend verification for the NEW Medicita Contigo project only.
-- Run as the project owner. These are simulated SQL identities, not Google
-- sessions or a browser test. All fixture rows are deliberately rolled back.
-- No DDL, passwords, reusable accounts, real identifiers or external calls.
do $smoke$
declare
  v_admin uuid:=gen_random_uuid();
  v_reception uuid:=gen_random_uuid();
  v_a uuid:=gen_random_uuid();
  v_b uuid:=gen_random_uuid();
  v_users uuid[];
  v_service uuid;
  v_professional uuid;
  v_room uuid;
  v_early uuid;
  v_late uuid;
  v_occupied uuid;
  v_a_original uuid;
  v_b_original uuid;
  v_other_booking uuid;
  v_wait uuid;
  v_offer uuid;
  v_new uuid;
  v_start timestamptz:=date_trunc('day',now())+interval '30 days 12 hours';
  v_day date;
  v_snapshot jsonb;
  v_report jsonb;
  v_label text:='SMOKE efímero '||gen_random_uuid();
  v_entry_role text:=current_user;
  v_passed boolean:=false;
begin
  perform set_config('plpgsql.check_asserts','on',true);
  v_users:=array[v_admin,v_reception,v_a,v_b];
  v_day:=(v_start at time zone 'America/Santiago')::date;

  -- PostgreSQL rolls this entire subtransaction back when ZX001 is raised.
  -- Any unexpected error also aborts/rolls back the DO statement.
  begin
    insert into auth.users(id,email,raw_user_meta_data)
    select id,id::text||'@example.invalid','{"given_name":"Prueba técnica efímera"}'::jsonb
    from unnest(v_users)id;
    update public.profiles set role='admin' where id=v_admin;
    update public.profiles set role='reception' where id=v_reception;
    assert (select count(*)=4 from public.profiles where id=any(v_users)), 'Temporary profiles must exist';

    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_service:=(public.save_resource('service',jsonb_build_object('name',v_label,'duration_minutes',20,'active',true))->>'id')::uuid;
    v_professional:=(public.save_resource('professional',jsonb_build_object('full_name',v_label,'service_id',v_service,'active',true))->>'id')::uuid;
    v_room:=(public.save_resource('room',jsonb_build_object('name',v_label,'specialty',v_label,'active',true))->>'id')::uuid;
    v_early:=public.create_slot(v_room,v_professional,v_service,v_start,20);
    v_late:=public.create_slot(v_room,v_professional,v_service,v_start+interval '60 minutes',20);
    v_occupied:=public.create_slot(v_room,v_professional,v_service,v_start+interval '120 minutes',20);

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_a_original:=public.book_slot(v_early);
    v_other_booking:=public.book_slot(v_occupied);
    assert (select status='reserved' and confirmed_at is null and arrived_at is null from public.appointments where id=v_a_original), 'Booking must not imply confirmation or attendance';
    begin
      update public.profiles set role='admin' where id=v_a;
      assert false,'A patient must not elevate their role';
    exception when insufficient_privilege then null;
    end;
    begin
      perform app_private.require_admin();
      assert false,'Private helpers must not be executable by a patient';
    exception when insufficient_privilege then null;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_b::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_b,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert not exists(select 1 from public.appointments where id in(v_a_original,v_other_booking)), 'Patient B must not see patient A appointments';
    v_b_original:=public.book_slot(v_late);
    begin
      perform public.book_slot(v_occupied,v_b_original);
      assert false,'Changing to an occupied slot must fail';
    exception when sqlstate 'P0001' then null;
    end;
    assert (select status='reserved' from public.appointments where id=v_b_original), 'A failed change must preserve the original reservation';
    v_wait:=public.join_waitlist(v_service,v_start-interval '1 day',v_start+interval '1 day',array[1,2,3,4,5,6,7],'any',v_b_original,true,null);

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    perform public.change_appointment(v_a_original,'cancel','Prueba técnica efímera');
    begin
      perform public.change_appointment(v_a_original,'cancel');
      assert false,'Cancellation must not release a slot twice';
    exception when sqlstate 'P0001' then null;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_reception::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reception,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert exists(select 1 from jsonb_array_elements(public.compatible_candidates(v_early))candidate where candidate->>'id'=v_wait::text), 'Reception must find the compatible waiting patient';
    v_offer:=public.make_offer(v_early,v_wait);

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_a::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_a,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    begin
      perform public.respond_offer(v_offer,true);
      assert false,'Another patient must not accept the offer';
    exception when sqlstate 'P0001' then null;
    end;
    begin
      perform public.book_slot(v_early);
      assert false,'A reserved offer must prevent another booking';
    exception when sqlstate 'P0001' then null;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_b::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_b,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_new:=public.respond_offer(v_offer,true);
    assert (select status='confirmed' and confirmed_at is not null and arrived_at is null from public.appointments where id=v_new), 'Acceptance confirms intention, not attendance';
    assert (select status='cancelled' from public.appointments where id=v_b_original), 'Acceptance must release the old reservation atomically';
    v_snapshot:=public.get_snapshot(jsonb_build_object('from',v_day,'to',v_day,'service_id',v_service,'limit',10));
    assert v_snapshot->'user'->>'id'=v_b::text, 'Snapshot identity must match the authenticated user';
    assert jsonb_array_length(v_snapshot->'profiles')=1, 'Patient snapshot must expose only the own profile';
    assert not exists(select 1 from jsonb_array_elements(v_snapshot->'appointments')a where a->>'patient_id'<>v_b::text), 'Snapshot must not disclose another patient';
    assert exists(select 1 from jsonb_array_elements(v_snapshot->'available')s where s->>'id'=v_late::text), 'The previous slot must become available';

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_report:=public.get_report(v_day,v_day,v_service);
    assert (v_report->>'total_slots')::integer=3, 'The report must use the selected independent service';
    assert (v_report->>'released_slots')::integer=2, 'Both cancelled slots must be recorded once';
    assert (v_report->>'reassigned_slots')::integer=1, 'One released slot has a different assigned patient';
    assert (v_report->>'recovered_slots')::integer=0, 'An accepted offer is not a completed recovery';
    assert (v_report->>'no_show_rate')::numeric=0, 'Future appointments must not inflate absence rates';
    perform public.set_user_role(v_reception,'supervisor');

    execute 'reset role';
    perform set_config('request.jwt.claim.sub',v_reception::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reception,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_snapshot:=public.get_snapshot(jsonb_build_object('from',(now() at time zone 'America/Santiago')::date,'to',v_day,'service_id',v_service,'limit',10));
    assert jsonb_array_length(v_snapshot->'appointments')=0 and jsonb_array_length(v_snapshot->'profiles')=0 and jsonb_array_length(v_snapshot->'waiting')=0 and jsonb_array_length(v_snapshot->'offers')=0, 'Supervisor must receive aggregates without patient records';
    assert jsonb_array_length(v_snapshot->'audit_log')>0, 'Supervisor audit redaction must be tested against existing records';
    assert not exists(select 1 from jsonb_array_elements(v_snapshot->'audit_log')e where e ? 'patient_id' or e ? 'actor_id'), 'Supervisor audit must omit identities';

    execute 'reset role';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    execute 'set local role anon';
    begin
      perform public.get_snapshot('{}');
      assert false,'Anonymous access must not execute the snapshot';
    exception when insufficient_privilege then null;
    end;

    v_passed:=true;
    raise exception using errcode='ZX001',message='Deliberately roll back every smoke fixture';
  exception when sqlstate 'ZX001' then
    assert v_passed,'Smoke verification did not finish';
  end;

  assert current_user=v_entry_role, 'The caller role must be restored after verification';
  assert not exists(select 1 from auth.users where id=any(v_users)), 'Temporary auth users must be rolled back';
  assert not exists(select 1 from public.profiles where id=any(v_users)), 'Temporary profiles must be rolled back';
  assert not exists(select 1 from public.notifications where patient_id=any(v_users)), 'Temporary notifications must be rolled back';
  assert not exists(select 1 from public.services where id=v_service), 'Temporary resources must be rolled back';
  assert not exists(select 1 from public.slots where id in(v_early,v_late,v_occupied)), 'Temporary slots must be rolled back';
  perform set_config('medicita.contigo_smoke',jsonb_build_object(
    'passed',true,'assertions_enabled',current_setting('plpgsql.check_asserts')='on','fixtures_rolled_back',true,
    'checks',jsonb_build_array('private profiles and appointments','no role escalation','private helper grants','reserved versus confirmed','failed reschedule preserves original','single cancellation','compatible candidates','supervised offer','offer owner and reservation protection','atomic acceptance','bounded private snapshot','reassignment versus completed recovery','future absence exclusion','supervisor aggregates','anonymous denial')
  )::text,true);
end
$smoke$;
select current_setting('medicita.contigo_smoke',true)::jsonb as verification;
