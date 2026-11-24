import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';

// Most cases isolate the baseline plus rewards. The final case then installs
// communication too and verifies their shared profile/appointment transitions.
let db,service,migration,sequence=0;
const admin=randomUUID(),reception=randomUUID(),supervisor=randomUUID();
const existing=randomUUID(),historical=randomUUID(),unaudited=randomUUID(),futureCompleted=randomUUID();
let legacyConfirmed,legacyCompleted;
async function root(sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");return db.query(sql,params)}
async function as(user,sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`);return db.query(sql,params)}
async function scalar(user,sql,params=[]){return (await as(user,sql,params)).rows[0].value}
async function rewards(user){return scalar(user,'select get_my_rewards() as value')}
async function newUser(role='patient',name='Persona de prueba'){
 const id=randomUUID();await root('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${id}@example.invalid`,JSON.stringify({given_name:name})]);
 if(role!=='patient')await root('update profiles set role=$1 where id=$2',[role,id]);return id;
}
async function resource(kind,data){return scalar(admin,'select save_resource($1,$2::jsonb) as value',[kind,JSON.stringify(data)])}
async function fixture(){const n=++sequence;return {room:(await resource('room',{name:`Box coronitas ${n}`,specialty:'Medicina general',active:true})).id,professional:(await resource('professional',{full_name:`Profesional ficticio ${n}`,service_id:service,active:true})).id,start:(await root("select date_trunc('day',now())+$1::integer*interval '1 day'+interval '15 hours' as value",[n+3])).rows[0].value}}
async function slot(f,minutes=0){return scalar(admin,"select create_slot($1,$2,$3,$4::timestamptz+$5*interval '1 minute',30) as value",[f.room,f.professional,service,f.start,minutes])}
async function book(user,id,old=null){return scalar(user,'select book_slot($1,$2) as value',[id,old])}
async function pastAppointment(user,{checkin=true}={}){
 const f=await fixture(),s=randomUUID(),a=randomUUID();
 // Only test fixtures may insert past slots. Production create_slot rejects them.
 await root("insert into slots(id,room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) values($1,$2,$3,$4,date_trunc('day',now() at time zone 'America/Santiago') at time zone 'America/Santiago',(date_trunc('day',now() at time zone 'America/Santiago') at time zone 'America/Santiago')+interval '30 minutes',30)",[s,f.room,f.professional,service]);
 await root('insert into appointments(id,slot_id,patient_id) values($1,$2,$3)',[a,s,user]);
 if(checkin)await as(reception,'select register_arrival(null,$1)',[a]);
 return a;
}
async function completed(user){const a=await pastAppointment(user);await as(reception,"select change_appointment($1,'complete')",[a]);return a}
async function ledger(user){return (await root('select * from reward_ledger where user_id=$1 order by created_at,id',[user])).rows}
async function count(user,action){return (await root('select count(*)::int as n from reward_ledger where user_id=$1 and action=$2',[user,action])).rows[0].n}
async function process(id){return (await root('select care_process_id from appointments where id=$1',[id])).rows[0].care_process_id}

before(async()=>{
 db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.query('insert into auth.users(id,email) values($1,$2)',[existing,'existing@example.invalid']);
 await db.exec(await readFile('supabase/migrations/20261116033253_contigo.sql','utf8'));
 for(const [id,role] of [[admin,'admin'],[reception,'reception'],[supervisor,'supervisor'],[historical,'patient'],[unaudited,'patient'],[futureCompleted,'patient']]){
  await root('insert into auth.users(id,email) values($1,$2)',[id,`${id}@example.invalid`]);await root('update profiles set role=$1 where id=$2',[role,id]);
 }
 service=(await root("select id from services where name='Medicina general'")).rows[0].id;
 await as(existing,"select save_profile('Cuenta existente','De prueba','','{}')");
 const f=await fixture();legacyConfirmed=await book(existing,await slot(f));await as(existing,"select change_appointment($1,'confirm')",[legacyConfirmed]);
 legacyCompleted=await completed(historical);
 const noAudit=await pastAppointment(unaudited);await root("update appointments set status='completed',completed_at=now() where id=$1",[noAudit]);
 const futureF=await fixture(),futureA=await book(futureCompleted,await slot(futureF));
 await root("update appointments set status='completed',arrived_at=now(),completed_at=now() where id=$1",[futureA]);
 await root("insert into checkin_events(appointment_id,actor_id,method) values($1,$2,'manual')",[futureA,reception]);
 await root("insert into appointment_events(appointment_id,patient_id,actor_id,event) values($1,$2,$3,'completed')",[futureA,futureCompleted,reception]);
 migration=await readFile('supabase/migrations/20261124205837_contigo_coronitas_20261124.sql','utf8');await db.exec(migration);
});
after(async()=>{await db?.close()});

test('backfill preserves accounts and credits welcome/profile/valid confirmation and audited past completion once',async()=>{
 const e=await rewards(existing);assert.equal(e.balance,10);assert.equal(e.symbolic,true);assert.equal(e.rules.length,4);assert.equal(e.missions.length,6);assert.equal(e.awards.length,11);
 assert.equal(await count(existing,'welcome'),1);assert.equal(await count(existing,'profile'),1);assert.equal(await count(existing,'confirmation'),1);
 assert.equal((await rewards(historical)).balance,15);assert.equal((await rewards(historical)).validated_attendances,1);
 assert.equal((await rewards(unaudited)).balance,5);assert.equal((await rewards(futureCompleted)).balance,5);
 assert.equal(await process(legacyConfirmed),legacyConfirmed);assert.equal(await process(legacyCompleted),legacyCompleted);
 const previous=await ledger(existing);await root('select 1');await db.exec(migration);
 assert.deepEqual(await ledger(existing),previous);assert.equal((await rewards(historical)).balance,15);
});

test('new users receive one server-owned welcome, including duplicate auth trigger delivery and reconnects',async()=>{
 const p=await newUser();assert.equal((await rewards(p)).balance,5);
 await root('select app_private.reward_welcome($1)',[p]);await root('select app_private.reward_welcome($1)',[p]);
 for(let i=0;i<3;i++)assert.equal((await rewards(p)).balance,5);
 assert.equal(await count(p,'welcome'),1);assert.equal((await rewards(p)).community.opt_in,false);
 assert.equal((await rewards(p)).level.id,'level-first');
});

test('profile completion needs explicit valid onboarding, pays three once and requires no clinical information',async()=>{
 const p=await newUser();await root("update profiles set preferences=preferences||'{\"simple_mode\":true}'::jsonb where id=$1",[p]);assert.equal((await rewards(p)).balance,5);
 await as(p,"select save_profile('Nombre básico','','','{}')");assert.equal((await rewards(p)).balance,8);
 await as(p,"select save_profile('Otro nombre','Opcional','','{}')");assert.equal((await rewards(p)).balance,8);assert.equal(await count(p,'profile'),1);
 const m=(await rewards(p)).missions.find(x=>x.key==='profile');assert.equal(m.completed,true);assert.equal(m.progress,1);
});

test('reservation, cancellation, no-show and calendar reads never generate coronitas or penalties',async()=>{
 const p=await newUser(),f=await fixture(),a=await book(p,await slot(f));assert.equal((await rewards(p)).balance,5);
 await as(p,"select get_snapshot('{}')");await as(p,"select change_appointment($1,'cancel','Cambio de planes')",[a]);assert.equal((await rewards(p)).balance,5);
 const ns=await pastAppointment(p,{checkin:false});await root("update slots set starts_at=now()-interval '2 hours',ends_at=now()-interval '90 minutes' where id=(select slot_id from appointments where id=$1)",[ns]);
 await as(reception,"select change_appointment($1,'no_show')",[ns]);assert.equal((await rewards(p)).balance,5);
 assert.deepEqual((await ledger(p)).map(x=>x.action),['welcome']);
});

test('confirmation pays two once through retries, repeated rescheduling and failed atomic replacement',async()=>{
 const p=await newUser(),other=await newUser(),f=await fixture();const s1=await slot(f),s2=await slot(f,60),s3=await slot(f,120),occupied=await slot(f,180);
 const first=await book(p,s1);await as(p,"select change_appointment($1,'confirm')",[first]);assert.equal((await rewards(p)).balance,7);await assert.rejects(as(p,"select change_appointment($1,'confirm')",[first]));
 const second=await book(p,s2,first);assert.equal(await process(second),await process(first));await as(p,"select change_appointment($1,'confirm')",[second]);
 const third=await book(p,s3,second);await as(p,"select change_appointment($1,'confirm')",[third]);await book(other,occupied);
 await assert.rejects(book(p,occupied,third));assert.equal((await root('select status from appointments where id=$1',[third])).rows[0].status,'confirmed');
 assert.equal(await count(p,'confirmation'),1);assert.equal((await rewards(p)).balance,7);assert.equal((await rewards(p)).validated_attendances,0);
});

test('accepted offers are explicit confirmations and preserve the care process of an earlier confirmed appointment',async()=>{
 const p=await newUser(),f=await fixture(),early=await slot(f),late=await slot(f,120),old=await book(p,late);
 await as(p,"select change_appointment($1,'confirm')",[old]);
 const wait=await scalar(p,"select join_waitlist($1,$2::timestamptz-interval '1 day',$2::timestamptz+interval '2 days',array[1,2,3,4,5,6,7],'any',$3,true,null) as value",[service,f.start,old]);
 const offer=await scalar(reception,'select make_offer($1,$2) as value',[early,wait]);const current=await scalar(p,'select respond_offer($1,true) as value',[offer]);
 assert.equal(await process(current),await process(old));assert.equal((await rewards(p)).balance,7);assert.equal(await count(p,'confirmation'),1);
 const q=await newUser(),g=await fixture(),target=await slot(g);
 const w=await scalar(q,"select join_waitlist($1,$2::timestamptz-interval '1 day',$2::timestamptz+interval '2 days',array[1,2,3,4,5,6,7],'any',null,true,null) as value",[service,g.start]);
 const o=await scalar(admin,'select make_offer($1,$2) as value',[target,w]);await scalar(q,'select respond_offer($1,true) as value',[o]);assert.equal((await rewards(q)).balance,7);
});

test('QR display and arrival are not attendance; only authorized actual completion credits ten',async()=>{
 const p=await newUser(),f=await fixture(),future=await book(p,await slot(f));
 const qr=(await root('select checkin_token from appointments where id=$1',[future])).rows[0].checkin_token;assert.ok(qr);
 await assert.rejects(as(p,'select register_arrival($1)',[qr]));await assert.rejects(as(reception,'select register_arrival($1)',[qr]));
 await assert.rejects(as(reception,"select change_appointment($1,'complete')",[future]));assert.equal((await rewards(p)).balance,5);
 const a=await pastAppointment(p);assert.equal((await rewards(p)).balance,5);await assert.rejects(as(p,"select change_appointment($1,'complete')",[a]));
 await assert.rejects(as(supervisor,"select change_appointment($1,'complete')",[a]));await as(reception,"select change_appointment($1,'complete')",[a]);
 assert.equal((await rewards(p)).balance,15);assert.equal((await rewards(p)).validated_attendances,1);await assert.rejects(as(reception,"select change_appointment($1,'complete')",[a]));
 await root('select app_private.reward_attendance($1,$2,now())',[a,reception]);assert.equal(await count(p,'attendance'),1);assert.equal((await rewards(p)).balance,15);
});

test('correction reverses without deleting, corrects missions/tiers and revalidation cannot farm net rewards',async()=>{
 const p=await newUser(),a=await completed(p);const original=(await ledger(p)).find(x=>x.action==='attendance');const firstEarned=(await rewards(p)).awards.find(x=>x.id==='mission-attendance-1').earned_at;
 await assert.rejects(as(p,'select correct_attendance($1,$2)',[a,'Corrección no autorizada']));await assert.rejects(as(reception,'select correct_attendance($1,$2)',[a,'corto']));
 for(let cycle=0;cycle<3;cycle++){
  await as(reception,'select correct_attendance($1,$2)',[a,'Validación ingresada por error']);
  const corrected=await rewards(p);assert.equal(corrected.balance,5);assert.equal(corrected.validated_attendances,0);assert.equal(corrected.missions.find(x=>x.key==='attendance-1').completed,false);
  const badge=corrected.awards.find(x=>x.id==='mission-attendance-1');assert.equal(badge.earned,true);assert.equal(badge.active,false);assert.equal(badge.earned_at,firstEarned);
  await assert.rejects(as(reception,'select correct_attendance($1,$2)',[a,'La corrección ya fue aplicada']));
  if(cycle===0)await as(admin,"select save_reward_rule('attendance',27,'Actualizar regla para eventos futuros')");
  await as(reception,"select change_appointment($1,'complete')",[a]);assert.equal((await rewards(p)).balance,15);assert.equal((await rewards(p)).validated_attendances,1);
 }
 const entries=await ledger(p);assert.deepEqual(entries.find(x=>x.id===original.id),original);assert.equal(entries.filter(x=>x.action==='attendance_correction').length,3);
 assert.ok(entries.filter(x=>x.action==='attendance_correction').every(x=>x.amount===-10&&x.reversal_of));assert.ok(entries.filter(x=>x.action==='attendance').every(x=>x.amount===10));
 assert.equal((await root("select count(*)::int as n from user_reward_awards where user_id=$1 and award_id='mission-attendance-1'",[p])).rows[0].n,1);
 assert.equal((await root("select count(*)::int as n from reward_award_events where user_id=$1 and award_id='mission-attendance-1' and event='earned'",[p])).rows[0].n,1);
 const q=await newUser();await completed(q);assert.equal((await rewards(q)).balance,32);await as(admin,"select save_reward_rule('attendance',10,'Restaurar regla inicial de asistencia')");
});

test('six missions use real distinct validation counts; badges and level thresholds add no extra coronitas',async()=>{
 const p=await newUser();await as(p,"select save_profile('Cinco controles','','','{}')");const f=await fixture(),confirm=await book(p,await slot(f));await as(p,"select change_appointment($1,'confirm')",[confirm]);
 const appointments=[];for(let i=0;i<5;i++)appointments.push(await completed(p));const value=await rewards(p);
 assert.equal(value.balance,60);assert.equal(value.validated_attendances,5);assert.equal(value.level.id,'level-silver');assert.equal(value.next_level.threshold,100);
 assert.ok(value.missions.every(x=>x.completed));assert.equal((await ledger(p)).length,8);
 await as(reception,'select correct_attendance($1,$2)',[appointments[0],'Corrección de control registrado por error']);
 const corrected=await rewards(p);assert.equal(corrected.balance,50);assert.equal(corrected.validated_attendances,4);assert.equal(corrected.missions.find(x=>x.key==='attendance-5').progress,4);assert.equal(corrected.missions.find(x=>x.key==='attendance-5').completed,false);
 await as(admin,'select adjust_coronitas($1,-1,$2)',[p,'Ajuste administrativo de prueba']);assert.equal((await rewards(p)).level.id,'level-bronze');assert.equal((await rewards(p)).awards.find(x=>x.id==='level-silver').active,false);
 for(const [amount,level] of [[51,'level-gold'],[100,'level-contigo']]){await as(admin,'select adjust_coronitas($1,$2,$3)',[p,amount,'Reconocimiento administrativo documentado']);assert.equal((await rewards(p)).level.id,level)}
 assert.equal((await rewards(p)).next_level,null);assert.equal((await rewards(p)).progress.percent,100);
});

test('rule changes and reasoned signed adjustments require admin and preserve historical values',async()=>{
 const p=await newUser();for(const actor of [p,reception,supervisor]){
  await assert.rejects(as(actor,"select save_reward_rule('welcome',6,'Motivo administrativo de prueba')"));await assert.rejects(as(actor,'select adjust_coronitas($1,1,$2)',[p,'Motivo administrativo de prueba']));
 }
 for(const [amount,reason] of [[0,'Motivo suficientemente largo'],[1001,'Motivo suficientemente largo'],[1,'corto']])await assert.rejects(as(admin,'select adjust_coronitas($1,$2,$3)',[p,amount,reason]));
 await assert.rejects(as(admin,"select save_reward_rule('unknown',2,'Motivo suficientemente largo')"));await assert.rejects(as(admin,"select save_reward_rule('welcome',101,'Motivo suficientemente largo')"));
 await as(admin,"select save_reward_rule('welcome',6,'Modificar solo nuevas bienvenidas')");assert.equal((await rewards(p)).balance,5);const q=await newUser();assert.equal((await rewards(q)).balance,6);
 const id=await scalar(admin,'select adjust_coronitas($1,-2,$2) as value',[p,'Corrección administrativa documentada']);assert.equal((await rewards(p)).balance,3);assert.equal((await rewards(p)).level.id,'level-none');
 assert.equal((await root('select actor_id from reward_ledger where id=$1',[id])).rows[0].actor_id,admin);
 assert.ok((await root("select id from audit_log where patient_id=$1 and event='coronitas_adjusted'",[p])).rows.length);
 await as(admin,"select save_reward_rule('welcome',5,'Restaurar cinco coronitas de bienvenida')");
});

test('immutable ledger, RLS and private helper grants prevent browser self-awards and cross-person history',async()=>{
 const p=await newUser(),q=await newUser();
 await assert.rejects(as(null,'select get_my_rewards()'));await assert.rejects(as(null,'select get_reward_community()'));
 for(const sql of ["select app_private.reward_summary($1)","select app_private.reward_welcome($1)","select app_private.reward_balance($1)","select app_private.reward_attendance($1,$1,now())"]){await assert.rejects(as(p,sql,[p]))}
 await assert.rejects(as(p,"insert into reward_ledger(user_id,action,amount,dedupe_key,reason) values($1,'welcome',100,'forged','Intento de cliente')",[p]));
 await assert.rejects(as(p,'update reward_rules set amount=100'));await assert.rejects(as(admin,'update reward_ledger set amount=100 where user_id=$1',[p]));
 await assert.rejects(root('update reward_ledger set amount=100 where user_id=$1',[p]));await assert.rejects(root('delete from reward_ledger where user_id=$1',[p]));
 assert.equal((await as(p,'select * from reward_ledger where user_id=$1',[q])).rows.length,0);assert.equal((await as(supervisor,'select * from reward_ledger')).rows.length,1);
 for(const user of [p,reception,supervisor]){await assert.rejects(as(user,'select get_reward_history($1)',[q]));await assert.rejects(as(user,'select get_people_rewards()'))}
 assert.equal((await scalar(admin,'select get_reward_history($1) as value',[q])).total,1);assert.equal((await rewards(p)).balance,5);
 assert.equal((await root("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('reward_ledger','reward_rules','care_processes','attendance_validations','user_reward_awards','reward_award_events','reward_catalog','reward_community_profiles') and table_name in (select relname from pg_class where relrowsecurity)")).rows[0].n,8);
});

test('history is paginated and provides only active attendance credits as correctable',async()=>{
 const p=await newUser(),a=await completed(p);let history=await scalar(p,'select get_reward_history(null,0,1) as value');assert.equal(history.total,2);assert.equal(history.items.length,1);assert.equal(history.has_more,true);
 history=await scalar(admin,'select get_reward_history($1,0,25) as value',[p]);let item=history.items.find(x=>x.action==='attendance');assert.equal(item.correctable,true);assert.equal(item.appointment_id,a);assert.equal(item.reference.care_process_id,await process(a));
 await as(reception,'select correct_attendance($1,$2)',[a,'Corregir registro ingresado por error']);history=await scalar(p,'select get_reward_history() as value');assert.equal(history.items.find(x=>x.id===item.id).correctable,false);assert.ok(history.items.find(x=>x.action==='attendance_correction').reversal_of);
 for(const args of [[-1,25],[0,0],[0,101]])await assert.rejects(as(p,'select get_reward_history(null,$1,$2)',args));
});

test('admin people supports all real users, query/level filters, ordering and bounded pagination',async()=>{
 const a=await newUser('patient','Prueba Buscador Alfa'),b=await newUser('patient','Prueba Buscador Beta');await as(admin,'select adjust_coronitas($1,30,$2)',[b,'Reconocimiento para comprobar orden']);
 let result=await scalar(admin,"select get_people_rewards('Prueba Buscador','','crowns_desc',0,1) as value");assert.equal(result.total,2);assert.equal(result.items[0].id,b);assert.equal(result.items[0].is_demo,false);assert.equal(result.has_more,true);
 result=await scalar(admin,"select get_people_rewards('Prueba Buscador','','crowns_asc',0,25) as value");assert.equal(result.items[0].id,a);
 result=await scalar(admin,"select get_people_rewards('Prueba Buscador','','name_asc',1,1) as value");assert.equal(result.items[0].id,b);assert.equal(result.has_more,false);
 result=await scalar(admin,"select get_people_rewards('Prueba Buscador','level-bronze','crowns_desc',0,25) as value");assert.equal(result.total,1);assert.equal(result.items[0].id,b);
 for(const sql of ["select get_people_rewards('','bad')","select get_people_rewards('','','bad')","select get_people_rewards('','',null)","select get_people_rewards('','','crowns_desc',-1,25)","select get_people_rewards('','','crowns_desc',0,101)"])await assert.rejects(as(admin,sql));
});

test('community is opt-in, sanitizes output and permits immediate opt-out with empty alias',async()=>{
 const p=await newUser(),q=await newUser();let value=await scalar(p,'select get_reward_community() as value');assert.equal(value.total,0);
 for(const alias of ['x','a'.repeat(25),'mail@example.invalid','912345678','sitio http','www clinica'])await assert.rejects(as(p,"select save_community_preferences(true,$1,'heart')",[alias]));
 await assert.rejects(as(p,"select save_community_preferences(true,'Alias seguro','photo-url')"));
 await as(p,"select save_community_preferences(true,'ConTigo 12','heart')");await as(q,"select save_community_preferences(true,'Comunidad','leaf')");
 value=await scalar(p,'select get_reward_community(0,1) as value');assert.equal(value.total,2);assert.equal(value.has_more,true);
 const whole=await scalar(p,'select get_reward_community() as value');assert.ok(whole.items.some(x=>x.is_self));for(const item of whole.items)assert.deepEqual(Object.keys(item).sort(),['alias','avatar','balance','is_self','level']);
 assert.equal((await as(q,'select * from reward_community_profiles where user_id=$1',[p])).rows.length,0);
 await as(p,"select save_community_preferences(false,'','contigo')");value=await scalar(q,'select get_reward_community() as value');assert.equal(value.total,1);assert.equal(value.items[0].alias,'Comunidad');assert.equal((await rewards(p)).balance,5);
 await as(q,"select save_community_preferences(false,'','contigo')");assert.equal((await scalar(p,'select get_reward_community() as value')).total,0);
});

test('event and care-process unique constraints reject duplicate rewards and mismatched ownership',async()=>{
 const p=await newUser(),q=await newUser(),f=await fixture(),a=await book(p,await slot(f)),s=await slot(f,60);const care=await process(a);
 await assert.rejects(root("insert into reward_ledger(user_id,action,amount,dedupe_key,reason) values($1,'welcome',5,'welcome','Duplicado rechazado')",[p]));
 await assert.rejects(root('insert into appointments(slot_id,patient_id,care_process_id) values($1,$2,$3)',[s,q,care]));
 assert.equal((await rewards(q)).balance,5);assert.equal((await root('select count(*)::int as n from appointments where slot_id=$1',[s])).rows[0].n,0);
});

test('simultaneously submitted confirmation retries produce one valid transition and one reward',async()=>{
 const p=await newUser(),f=await fixture(),a=await book(p,await slot(f));
 // PGlite executes these delivered requests on its PostgreSQL connection. The
 // production RPC additionally holds the transaction-level schedule lock, and
 // the ledger has a unique (user_id,dedupe_key) constraint.
 const attempts=await Promise.allSettled([
  as(p,"select change_appointment($1,'confirm')",[a]),
  as(p,"select change_appointment($1,'confirm')",[a]),
 ]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 assert.equal(await count(p,'confirmation'),1);assert.equal((await rewards(p)).balance,7);
 assert.equal((await root('select status from appointments where id=$1',[a])).rows[0].status,'confirmed');
});

test('rewards and communication migrations compose: preferences never onboard, calls never pay and validated completion closes calls atomically',async()=>{
 await db.exec('reset role');await db.exec(await readFile('supabase/migrations/20261124205903_contigo_comunicacion_visual_20261124.sql','utf8'));
 const p=await newUser();await as(p,"select save_accessibility_preferences('{\"visual_mode\":true,\"simple_mode\":true}')");
 assert.equal((await rewards(p)).balance,5);assert.equal((await root('select onboarded from profiles where id=$1',[p])).rows[0].onboarded,false);
 await as(p,"select save_profile('Perfil integrado','','','{\"visual_mode\":true}')");assert.equal((await rewards(p)).balance,8);
 const a=await pastAppointment(p),request=randomUUID();
 const callId=await scalar(reception,'select call_to_box($1,$2) as value',[a,request]);
 assert.equal(await scalar(reception,'select call_to_box($1,$2) as value',[a,request]),callId);
 await as(p,"select respond_box_call($1,'help')",[callId]);assert.equal((await rewards(p)).balance,8);
 await as(reception,"select change_appointment($1,'complete')",[a]);
 assert.equal((await rewards(p)).balance,18);assert.equal((await rewards(p)).validated_attendances,1);
 assert.ok((await root('select closed_at from box_calls where id=$1',[callId])).rows[0].closed_at);
 await assert.rejects(as(p,"select respond_box_call($1,'understood')",[callId]),/cerró/);
 const history=await ledger(p);await db.exec('reset role');await db.exec(migration);await db.exec(await readFile('supabase/migrations/20261124205903_contigo_comunicacion_visual_20261124.sql','utf8'));
 assert.deepEqual(await ledger(p),history);assert.equal((await rewards(p)).balance,18);assert.equal((await rewards(p)).validated_attendances,1);
 assert.equal((await root('select preferences from profiles where id=$1',[p])).rows[0].preferences.visual_mode,true);
});
