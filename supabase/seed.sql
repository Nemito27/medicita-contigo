-- OPTIONAL FICTITIOUS seed for an independent presentation/development project.
-- Never run in Medicita original or in a clinical production database.
-- No auth users, passwords, admin accounts or real patient data are inserted.
-- The full A -> B demonstration is browser-local and does not need this file.
begin;
do $seed$
declare
  v_service uuid;
  v_room uuid;
  v_professional uuid;
  v_duration integer;
  v_start timestamptz;
  v_end timestamptz;
  v_day integer;
  v_name text;
begin
  for v_name in select unnest(array['Medicina general','Odontología','Enfermería']) loop
    select id,duration_minutes into strict v_service,v_duration from public.services where name=v_name;
    select id into v_room from public.rooms where specialty=v_name and active order by name limit 1;
    if v_room is null then continue; end if;
    select id into v_professional from public.professionals
      where full_name='Profesional ficticio · '||v_name and service_id=v_service limit 1;
    if v_professional is null then
      insert into public.professionals(full_name,service_id)
      values('Profesional ficticio · '||v_name,v_service) returning id into v_professional;
    end if;
    for v_day in 1..5 loop
      v_start:=(((now() at time zone 'America/Santiago')::date+v_day)::timestamp+interval '10 hours') at time zone 'America/Santiago';
      v_end:=v_start+v_duration*interval '1 minute';
      if not exists(select 1 from public.slots s where(s.room_id=v_room or s.professional_id=v_professional) and s.starts_at<v_end and s.ends_at>v_start) then
        insert into public.slots(room_id,professional_id,service_id,starts_at,ends_at,duration_minutes)
        values(v_room,v_professional,v_service,v_start,v_end,v_duration);
      end if;
    end loop;
  end loop;
end
$seed$;
commit;
