import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
let db,service;let fixtureNumber=0;
const admin=randomUUID(),reception=randomUUID(),supervisor=randomUUID();
const preexisting=randomUUID();
async function root(sql,params=[]){await db.exec('reset role');return db.query(sql,params)}
async function as(user,sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`);return db.query(sql,params)}
async function scalar(user,sql,params=[]){return (await as(user,sql,params)).rows[0].value}
async function newUser(role='patient'){const id=randomUUID();await root('insert into auth.users(id,email) values($1,$2)',[id,`${id}@example.invalid`]);if(role!=='patient')await root('update profiles set role=$1 where id=$2',[role,id]);return id}
async function resource(kind,data){return scalar(admin,'select save_resource($1,$2::jsonb) as value',[kind,JSON.stringify(data)])}
async function fixture({serviceId=service,name='Medicina general',duration=30}={}){const n=++fixtureNumber;const room=(await resource('room',{name:`Box TEST ${n}`,specialty:name,active:true})).id;const professional=(await resource('professional',{full_name:`Profesional TEST ${n}`,service_id:serviceId,active:true})).id;const start=(await root("select date_trunc('day',now())+($1::integer)*interval '1 day'+interval '15 hours' as value",[n+3])).rows[0].value;return {room,professional,service:serviceId,start,duration}}
async function slot(f,minutes=0,duration=f.duration){return scalar(admin,"select create_slot($1,$2,$3,$4::timestamptz+$5*interval '1 minute',$6) as value",[f.room,f.professional,f.service,f.start,minutes,duration])}
async function book(patient,id,old=null){return scalar(patient,'select book_slot($1,$2) as value',[id,old])}
async function status(id){return (await root('select status from appointments where id=$1',[id])).rows[0].status}
async function wait(patient,f,old=null,extra={}){return scalar(patient,"select join_waitlist($1,$2::timestamptz-interval '1 day',$2::timestamptz+interval '2 days',$3::integer[],$4,$5,$6,$7) as value",[f.service,f.start,extra.days||[1,2,3,4,5,6,7],extra.period||'any',old,extra.receive??true,extra.id||null])}
before(async()=>{
 db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"given_name\":\"Cuenta previa\",\"role\":\"admin\"}')",[preexisting,'preexisting@example.invalid']);
 for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 for(const [id,role] of [[admin,'admin'],[reception,'reception'],[supervisor,'supervisor']]){await root('insert into auth.users(id,email) values($1,$2)',[id,`${role}@example.invalid`]);await root('update profiles set role=$1 where id=$2',[role,id])}
 service=(await root("select id from services where name='Medicina general'")).rows[0].id;
});
after(async()=>{await db?.close()});

test('users registered before schema installation receive a patient profile and one welcome',async()=>{
 const profile=(await root('select role,full_name,onboarded from profiles where id=$1',[preexisting])).rows[0];
 assert.equal(profile.role,'patient');assert.equal(profile.full_name,'Cuenta previa');assert.equal(profile.onboarded,false);
 assert.equal((await root("select count(*)::int as count from notifications where patient_id=$1 and dedupe_key='welcome'",[preexisting])).rows[0].count,1);
});

test('RLS and explicit function grants isolate patients and deny anonymous or privileged helper access',async()=>{
 const p=await newUser(),other=await newUser();
 assert.equal((await as(p,'select id from profiles')).rows.length,1);
 assert.equal((await as(p,'select id from profiles where id=$1',[other])).rows.length,0);
 await assert.rejects(as(null,'select * from rooms'));
 await assert.rejects(as(null,"select get_snapshot('{}')"));
 await assert.rejects(as(p,"update profiles set role='admin' where id=$1",[p]));
 await assert.rejects(as(p,"select app_private.require_admin()"));
 await assert.rejects(as(p,'select run_maintenance()'));
 await assert.rejects(as(p,"select set_user_role($1,'admin')",[p]));
 await assert.rejects(as(admin,"select set_user_role($1,'patient')",[admin]));
 await assert.rejects(as(p,"select get_report(current_date,current_date)"));
});

test('direct booking creates reserved, explicit confirmation changes intention only, and duplicate slots are rejected',async()=>{
 const p=await newUser(),other=await newUser(),f=await fixture(),s=await slot(f);
 const a=await book(p,s);assert.equal(await status(a),'reserved');
 await as(p,"select change_appointment($1,'confirm')",[a]);assert.equal(await status(a),'confirmed');
 assert.equal((await root('select arrived_at from appointments where id=$1',[a])).rows[0].arrived_at,null);
 await assert.rejects(book(other,s));
 assert.equal((await as(other,'select * from appointments where id=$1',[a])).rows.length,0);
 await assert.rejects(as(other,"select change_appointment($1,'cancel')",[a]));
 await assert.rejects(as(p,"insert into appointments(slot_id,patient_id) values($1,$2)",[s,p]));
});

test('variable duration prevents interval overlaps for both room and professional; past and mismatched service are rejected',async()=>{
 const f=await fixture({duration:45});await slot(f,0,45);
 await assert.rejects(slot(f,30,20));
 await slot(f,45,20);
 await assert.rejects(as(admin,"select create_slot($1,$2,$3,now()-interval '1 hour',20)",[f.room,f.professional,f.service]));
 await assert.rejects(slot(f,90,17));
 const od=(await root("select id from services where name='Odontología'")).rows[0].id;
 await assert.rejects(as(admin,'select create_slot($1,$2,$3,$4,20)',[f.room,f.professional,od,f.start]));
});

test('failed rescheduling preserves the original reservation and successful replacement is atomic',async()=>{
 const p=await newUser(),other=await newUser(),f=await fixture();
 const original=await slot(f,0),occupied=await slot(f,60),free=await slot(f,120);
 const a=await book(p,original);await book(other,occupied);
 await assert.rejects(book(p,occupied,a));assert.equal(await status(a),'reserved');
 assert.equal((await root('select count(*)::int as count from cancellations where appointment_id=$1',[a])).rows[0].count,0);
 const replacement=await book(p,free,a);assert.equal(await status(a),'cancelled');assert.equal(await status(replacement),'reserved');
 assert.equal((await root('select count(*)::int as count from cancellations where appointment_id=$1',[a])).rows[0].count,1);
});

test('cancellation records a single release, keeps audit and rejects repeats or configured late cancellation',async()=>{
 const p=await newUser(),f=await fixture(),s=await slot(f);const a=await book(p,s);
 await as(p,"select change_appointment($1,'cancel','Prefiero no responder')",[a]);
 await assert.rejects(as(p,"select change_appointment($1,'cancel')",[a]));
 const c=(await root('select * from cancellations where appointment_id=$1',[a])).rows[0];assert.ok(c.released_at);assert.ok(c.notice_minutes>0);
 const other=await newUser();await book(other,s);
 const near=await fixture();near.start=(await root("select date_trunc('minute',now())+interval '30 minutes' as value")).rows[0].value;
 const ns=await slot(near),na=await book(p,ns);await resource('setting',{cancellation_notice_minutes:60});
 await assert.rejects(as(p,"select change_appointment($1,'cancel')",[na]));assert.equal(await status(na),'reserved');
 await resource('setting',{cancellation_notice_minutes:0});
});

test('waitlist edits enforce days, period, consent, ownership and full-slot availability',async()=>{
 const p=await newUser(),other=await newUser(),f=await fixture(),s=await slot(f);
 const day=(await root("select extract(isodow from $1::timestamptz at time zone 'America/Santiago')::int as d",[f.start])).rows[0].d;
 const w=await wait(p,f,null,{days:[day]});
 let candidates=await scalar(reception,'select compatible_candidates($1) as value',[s]);assert.ok(candidates.some(x=>x.id===w));
 await wait(p,f,null,{id:w,days:[day===7?1:day+1]});
 candidates=await scalar(admin,'select compatible_candidates($1) as value',[s]);assert.ok(!candidates.some(x=>x.id===w));
 await wait(p,f,null,{id:w,days:[day],receive:false});
 candidates=await scalar(admin,'select compatible_candidates($1) as value',[s]);assert.ok(!candidates.some(x=>x.id===w));
 await assert.rejects(wait(other,f,null,{id:w}));
 await assert.rejects(wait(p,f,null,{days:[8]}));
 await as(p,'select leave_waitlist($1)',[w]);assert.equal((await as(p,'select * from waiting where id=$1',[w])).rows.length,0);
});

test('supervised offers preserve the old booking until owner acceptance and prevent double assignment',async()=>{
 const p=await newUser(),other=await newUser(),f=await fixture();
 const early=await slot(f),late=await slot(f,120);const old=await book(p,late);const w=await wait(p,f,old);
 const offer=await scalar(reception,'select make_offer($1,$2) as value',[early,w]);
 assert.equal(await status(old),'reserved');await assert.rejects(book(other,early));
 await assert.rejects(as(other,'select respond_offer($1,true)',[offer]));
 const current=await scalar(p,'select respond_offer($1,true) as value',[offer]);
 assert.equal(await status(old),'cancelled');assert.equal(await status(current),'confirmed');
 await assert.rejects(as(p,'select respond_offer($1,true)',[offer]));
 const newPatient=await newUser();await book(newPatient,late);
});

test('rejected, withdrawn and expired offers unblock the slot and maintenance is server-only',async()=>{
 const p=await newUser(),f=await fixture(),s=await slot(f),w=await wait(p,f);
 let offer=await scalar(admin,'select make_offer($1,$2) as value',[s,w]);await as(p,'select respond_offer($1,false)',[offer]);
 assert.equal((await root('select status from offers where id=$1',[offer])).rows[0].status,'declined');
 offer=await scalar(admin,'select make_offer($1,$2) as value',[s,w]);await as(reception,'select withdraw_offer($1)',[offer]);
 offer=await scalar(admin,'select make_offer($1,$2) as value',[s,w]);
 await root("update offers set created_at=now()-interval '2 hours',expires_at=now()-interval '1 minute' where id=$1",[offer]);
 await root('select run_maintenance()');assert.equal((await root('select status from offers where id=$1',[offer])).rows[0].status,'expired');
 await book(await newUser(),s);
});

test('staff check-in is day-bound and single-use; completion and no-show require valid transitions',async()=>{
 const p=await newUser(),f=await fixture(),future=await slot(f),futureBooking=await book(p,future);
 await assert.rejects(as(reception,"select change_appointment($1,'no_show')",[futureBooking]));
 const token=(await root('select checkin_token from appointments where id=$1',[futureBooking])).rows[0].checkin_token;
 await assert.rejects(as(reception,'select register_arrival($1)',[token]));
 const today=(await root("select (date_trunc('day',now() at time zone 'America/Santiago') at time zone 'America/Santiago') as value")).rows[0].value;
 const current=randomUUID();await root("insert into slots(id,room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) values($1,$2,$3,$4,$5::timestamptz,$5::timestamptz+interval '30 minutes',30)",[current,f.room,f.professional,f.service,today]);
 const a=randomUUID();await root("insert into appointments(id,slot_id,patient_id) values($1,$2,$3)",[a,current,p]);
 await assert.rejects(as(p,'select register_arrival(null,$1)',[a]));await as(reception,'select register_arrival(null,$1)',[a]);
 await assert.rejects(as(reception,'select register_arrival(null,$1)',[a]));
 await assert.rejects(as(p,"select change_appointment($1,'complete')",[a]));
 await as(reception,"select change_appointment($1,'complete')",[a]);assert.equal(await status(a),'completed');
 await assert.rejects(as(p,"select change_appointment($1,'cancel')",[a]));
});

test('admin resources enforce roles, configured schedules and absence blocks',async()=>{
 const f=await fixture();await assert.rejects(as(reception,"select save_resource('setting','{\"offer_minutes\":20}')"));
 const weekday=(await root("select extract(isodow from $1::timestamptz at time zone 'America/Santiago')::int as d",[f.start])).rows[0].d;
 await resource('schedule',{professional_id:f.professional,room_id:f.room,weekday,start_time:'08:00',end_time:'18:00',active:true});
 const created=await scalar(reception,'select create_slot($1,$2,$3,$4,20) as value',[f.room,f.professional,f.service,f.start]);assert.ok(created);
 await resource('block',{professional_id:f.professional,room_id:null,starts_at:new Date(new Date(f.start).getTime()+3600000).toISOString(),ends_at:new Date(new Date(f.start).getTime()+7200000).toISOString(),reason:'Feriado de prueba',active:true});
 await assert.rejects(slot(f,60));
 await assert.rejects(resource('setting',{role:'admin'}));await assert.rejects(resource('setting',{offer_minutes:0}));
});

test('snapshot is paginated and private, supervisor sees aggregates without patient records',async()=>{
 const p=await newUser();const from=(await root("select (now() at time zone 'America/Santiago')::date as d")).rows[0].d;
 const filters={from,to:new Date(new Date(from).getTime()+90*86400000).toISOString().slice(0,10),limit:1};
 const own=await scalar(p,'select get_snapshot($1::jsonb) as value',[JSON.stringify(filters)]);
 assert.equal(own.profiles.length,1);assert.equal(own.profiles[0].id,p);assert.ok(own.slots.length<=4);assert.equal(own.pagination.limit,1);assert.ok(own.pagination.has_more);
 const sup=await scalar(supervisor,'select get_snapshot($1::jsonb) as value',[JSON.stringify(filters)]);
 for(const key of ['appointments','profiles','offers','waiting','cancellations','appointment_events'])assert.equal(sup[key].length,0,key);
 assert.ok(sup.report.total_slots>0);assert.ok(sup.audit_log.every(e=>!('patient_id'in e)&&!('actor_id'in e)));
 await assert.rejects(as(supervisor,'select set_room($1,$2)',[(await root('select id from rooms limit 1')).rows[0].id,'busy']));
 await assert.rejects(as(p,"select get_snapshot('{\"from\":\"2020-01-01\",\"to\":\"2030-01-01\"}')"));
});

test('internal reminders are idempotent, respect preferences, and never claim external delivery',async()=>{
 const p=await newUser(),f=await fixture();f.start=(await root("select ((date_trunc('day',now() at time zone 'America/Santiago')+case when (now() at time zone 'America/Santiago')::time>='12:00'::time then interval '1 day' else interval '0 day' end+interval '12 hours') at time zone 'America/Santiago') as value")).rows[0].value;
 const s=await slot(f),a=await book(p,s);
 await as(p,"select save_profile('Paciente','Prueba','', '{\"reminder_hours\":[24],\"receive_offers\":false}')");
 await root("update appointments set created_at=now()-interval '2 days' where id=$1",[a]);
 let result=(await root('select run_maintenance() as value')).rows[0].value;assert.equal(result.external_messages_sent,0);
 await root('select run_maintenance()');
 const notes=(await root("select * from notifications where patient_id=$1 and kind='reminder'",[p])).rows;assert.equal(notes.length,1);
 const other=await newUser();await assert.rejects(as(other,'select mark_notification($1,true)',[notes[0].id]));
 await as(p,'select mark_notification($1,true)',[notes[0].id]);assert.equal((await root('select status from notification_deliveries where notification_id=$1',[notes[0].id])).rows[0].status,'read');
 await assert.rejects(as(p,"select save_profile('Paciente','Prueba','', '{\"role\":\"admin\"}')"));
});

test('reports count actual recovery only after a different patient completes and exclude future appointments from absence rate',async()=>{
 const svc=(await resource('service',{name:'Prestación TEST métricas',duration_minutes:20,active:true})).id;
 const f=await fixture({serviceId:svc,name:'Prestación TEST métricas',duration:20}),old=await newUser(),replacement=await newUser(),missing=await newUser();
 const day=(await root("select (now() at time zone 'America/Santiago')::date as d")).rows[0].d;
 const base=(await root("select ($1::date::timestamp at time zone 'America/Santiago') as value",[day])).rows[0].value;
 const s1=randomUUID(),s2=randomUUID(),s3=randomUUID();
 for(const [id,offset] of [[s1,-180],[s2,-120],[s3,120]])await root("insert into slots(id,room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) values($1,$2,$3,$4,now()+$5*interval '1 minute',now()+($5+20)*interval '1 minute',20)",[id,f.room,f.professional,svc,offset]);
 const oldA=randomUUID(),newA=randomUUID();
 await root("insert into appointments(id,slot_id,patient_id,status,created_at,cancelled_at,released_at) values($1,$2,$3,'cancelled',now()-interval '3 days',now()-interval '2 days',now()-interval '2 days')",[oldA,s1,old]);
 await root("insert into cancellations(appointment_id,slot_id,patient_id,released_at,notice_minutes) values($1,$2,$3,now()-interval '2 days',2880)",[oldA,s1,old]);
 await root("insert into appointments(id,slot_id,patient_id,status,created_at,confirmed_at) values($1,$2,$3,'confirmed',now()-interval '1 day',now()-interval '1 day')",[newA,s1,replacement]);
 await root("insert into appointments(slot_id,patient_id,status,no_show_at) values($1,$2,'no_show',now())",[s2,missing]);
 await root("insert into appointments(slot_id,patient_id,status) values($1,$2,'confirmed')",[s3,old]);
 const from=(await root("select (now() at time zone 'America/Santiago')::date-1 as d")).rows[0].d;const to=(await root("select (now() at time zone 'America/Santiago')::date+1 as d")).rows[0].d;
 let report=await scalar(supervisor,'select get_report($1,$2,$3) as value',[from,to,svc]);
 assert.equal(report.reassigned_slots,1);assert.equal(report.recovered_slots,0);assert.equal(Number(report.no_show_rate),100);
 await root("update appointments set status='completed',completed_at=now() where id=$1",[newA]);
 report=await scalar(supervisor,'select get_report($1,$2,$3) as value',[from,to,svc]);
 assert.equal(report.recovered_slots,1);assert.equal(report.released_slots,1);assert.equal(Number(report.no_show_rate),50);
 assert.ok(report.definitions.recovered_slots.includes('completada'));
});

test('existing slots revalidate changed work schedules and resource compatibility',async()=>{
 const p=await newUser(),f=await fixture(),s=await slot(f),w=await wait(p,f);
 const weekday=(await root("select extract(isodow from $1::timestamptz at time zone 'America/Santiago')::int as value",[f.start])).rows[0].value;
 await resource('schedule',{professional_id:f.professional,room_id:f.room,weekday,start_time:'08:00',end_time:'09:00',active:true});
 await assert.rejects(book(p,s));
 assert.equal((await scalar(admin,'select compatible_candidates($1) as value',[s])).length,0);
 const day=(await root("select ($1::timestamptz at time zone 'America/Santiago')::date as value",[f.start])).rows[0].value;
 const snapshot=await scalar(p,'select get_snapshot($1::jsonb) as value',[JSON.stringify({from:day,to:day})]);
 assert.ok(!snapshot.available.some(x=>x.id===s));assert.equal(snapshot.slots.find(x=>x.id===s).blocked,true);
 const f2=await fixture(),s2=await slot(f2),od=(await root("select id from services where name='Odontología'")).rows[0].id;
 await resource('professional',{id:f2.professional,full_name:'Profesional cambiado',service_id:od,active:true});
 await assert.rejects(book(p,s2));
 await resource('professional',{id:f2.professional,full_name:'Profesional restaurado',service_id:f2.service,active:true});
 await resource('room',{id:f2.room,name:'Box cambiado TEST',specialty:'Odontología',active:true});
 await assert.rejects(book(p,s2));
 await assert.rejects(as(p,'select app_private.slot_enabled(s) from slots s limit 1'));
});

test('null or noninteger settings are rejected without changing configuration',async()=>{
 const before=(await root('select config from system_settings where id=1')).rows[0].config;
 for(const value of [null,'60',1.5,{},[]])await assert.rejects(resource('setting',{offer_minutes:value}));
 for(const key of ['cancellation_notice_minutes','no_show_grace_minutes','early_cancellation_hours'])await assert.rejects(resource('setting',{[key]:null}));
 assert.deepEqual((await root('select config from system_settings where id=1')).rows[0].config,before);
});

test('owned next appointment and offer comparison survive a calendar range that excludes them',async()=>{
 const p=await newUser(),f=await fixture();
 f.start=(await root("select date_trunc('day',now())+interval '120 days 15 hours' as value")).rows[0].value;
 const late=await slot(f),old=await book(p,late);
 const first=await scalar(p,"select get_snapshot('{}') as value");
 assert.ok(first.appointments.some(a=>a.id===old));assert.ok(first.slots.some(s=>s.id===late));
 const early=await slot(f,-60*24*60);
 const waiting=await scalar(p,"select join_waitlist($1,now()+interval '50 days',now()+interval '121 days',array[1,2,3,4,5,6,7],'any',$2,true,null) as value",[f.service,old]);
 const offer=await scalar(admin,'select make_offer($1,$2) as value',[early,waiting]);
 const next=await scalar(p,"select get_snapshot('{\"limit\":10}') as value");
 assert.ok(next.offers.some(o=>o.id===offer&&o.old_appointment_id===old));
 assert.ok(next.appointments.some(a=>a.id===old));assert.ok(next.slots.some(s=>s.id===late));assert.ok(next.slots.some(s=>s.id===early));
 assert.ok(next.appointments.length<=21);
});

test('a changed target availability cannot cancel the original appointment during offer acceptance',async()=>{
 const p=await newUser(),f=await fixture(),early=await slot(f),late=await slot(f,120),old=await book(p,late),waiting=await wait(p,f,old);
 const offer=await scalar(admin,'select make_offer($1,$2) as value',[early,waiting]);
 await resource('block',{professional_id:f.professional,starts_at:f.start,ends_at:new Date(new Date(f.start).getTime()+30*60000).toISOString(),reason:'Ausencia posterior a la oferta'});
 await assert.rejects(as(p,'select respond_offer($1,true)',[offer]));
 assert.equal(await status(old),'reserved');assert.equal((await root('select status from offers where id=$1',[offer])).rows[0].status,'pending');
 assert.equal((await root('select count(*)::int as count from cancellations where appointment_id=$1',[old])).rows[0].count,0);
});

test('valid no-show can be recorded only by staff after the attendance grace period',async()=>{
 const p=await newUser(),f=await fixture(),past=randomUUID(),a=randomUUID();
 await root("insert into slots(id,room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) values($1,$2,$3,$4,now()-interval '2 hours',now()-interval '90 minutes',30)",[past,f.room,f.professional,f.service]);
 await root('insert into appointments(id,slot_id,patient_id) values($1,$2,$3)',[a,past,p]);
 await assert.rejects(as(p,"select change_appointment($1,'no_show')",[a]));
 await as(reception,"select change_appointment($1,'no_show')",[a]);assert.equal(await status(a),'no_show');
 assert.ok((await root('select no_show_at from appointments where id=$1',[a])).rows[0].no_show_at);
 await assert.rejects(as(reception,"select change_appointment($1,'no_show')",[a]));
 await assert.rejects(as(p,"select change_appointment($1,'cancel')",[a]));
});

test('morning preferences require the entire attention interval before noon',async()=>{
 const p=await newUser(),f=await fixture({duration:45});
 f.start=(await root("select (($1::timestamptz at time zone 'America/Santiago')::date::timestamp+interval '11 hours 45 minutes') at time zone 'America/Santiago' as value",[f.start])).rows[0].value;
 const s=await slot(f),w=await wait(p,f,null,{period:'morning'});
 assert.equal((await scalar(admin,'select compatible_candidates($1) as value',[s])).length,0);
 await assert.rejects(as(admin,'select make_offer($1,$2)',[s,w]));
 await wait(p,f,null,{id:w,period:'any'});
 assert.ok((await scalar(admin,'select compatible_candidates($1) as value',[s])).some(x=>x.id===w));
});

test('optional fictitious seed is repeatable and never creates auth accounts or patient appointments',async()=>{
 const users=(await root('select count(*)::int as count from auth.users')).rows[0].count;
 const appointments=(await root('select count(*)::int as count from appointments')).rows[0].count;
 const seed=await readFile('supabase/seed.sql','utf8');await db.exec('reset role');await db.exec(seed);
 const count=async()=>({professionals:(await root("select count(*)::int as count from professionals where full_name like 'Profesional ficticio · %'")).rows[0].count,slots:(await root("select count(*)::int as count from slots where professional_id in(select id from professionals where full_name like 'Profesional ficticio · %')")).rows[0].count});
 const first=await count();assert.equal(first.professionals,3);assert.equal(first.slots,15);
 await db.exec('reset role');await db.exec(seed);assert.deepEqual(await count(),first);
 assert.equal((await root('select count(*)::int as count from auth.users')).rows[0].count,users);
 assert.equal((await root('select count(*)::int as count from appointments')).rows[0].count,appointments);
});
