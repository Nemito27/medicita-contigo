import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {generateDecemberDataset,DECEMBER_DAYS,DECEMBER_TAG} from '../web/src/services/demo/december.js';
import {createDemoService,DEMO_STORAGE_KEY} from '../web/src/services/demo.js';
import {dayKey,chileParts,time,overlaps,slotEnabled,compatible} from '../web/src/services/demo/model.js';

const NOW='2026-11-24T12:00:00.000Z';
const active=a=>['reserved','confirmed','arrived'].includes(a.status);
const storageFixture=()=>{const entries=new Map();return {entries,getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};};
function fixture(dataset=generateDecemberDataset()){
 const storage=storageFixture(),service=createDemoService({storage,now:()=>new Date(NOW),dataset});
 return {service,storage,state:()=>JSON.parse(storage.getItem(`${DEMO_STORAGE_KEY}:${DECEMBER_TAG}`))};
}
function validateDataset(data){
 assert.equal(data.dataset_tag,DECEMBER_TAG);assert.equal(data.is_demo,true);assert.equal(data.timezone,'America/Santiago');
 assert.equal(data.profiles.filter(p=>p.role==='patient').length,120);assert.equal(data.profiles.length,123);
 assert.equal(data.professionals.length,12);assert.equal(data.rooms.length,8);assert.equal(data.services.length,5);
 for(const collection of ['profiles','professionals','rooms','services','slots','appointments','waiting','offers','schedules','notifications','appointment_events','cancellations','audit_log']){
  assert.equal(new Set(data[collection].map(row=>row.id)).size,data[collection].length,`${collection} IDs are unique`);
  for(const row of data[collection]){assert.equal(row.is_demo,true,`${collection} marker`);assert.equal(row.dataset_tag,DECEMBER_TAG,`${collection} tag`);}
 }
 for(const person of data.profiles){assert.match(person.email,/@example\.invalid$/);assert.equal(person.phone,'');}
 const december=data.slots.filter(s=>s.dataset_section==='december');assert.equal(december.length,528);
 const historical=data.slots.filter(s=>s.dataset_section==='history');assert.equal(historical.length,39);
 const slotById=new Map(data.slots.map(s=>[s.id,s]));
 for(const [index,day] of DECEMBER_DAYS.entries()){
  const slots=december.filter(s=>dayKey(s.starts_at)===day),ids=new Set(slots.map(s=>s.id));
  const appointments=data.appointments.filter(a=>ids.has(a.slot_id)&&active(a));
  assert.equal(slots.length,176);assert.equal(appointments.length,[120,126,114][index]);
  assert.equal(slots.length-appointments.length,[56,50,62][index]);
  for(const room of data.rooms){
   const own=slots.filter(s=>s.room_id===room.id).sort((a,b)=>time(a.starts_at)-time(b.starts_at));assert.equal(own.length,22);
   assert.equal(`${chileParts(own[0].starts_at).hour}:${chileParts(own[0].starts_at).minute}`,'08:00');
   assert.equal(`${chileParts(own.at(-1).ends_at).hour}:${chileParts(own.at(-1).ends_at).minute}`,'20:00');
   assert.equal(own.filter(s=>chileParts(s.starts_at).hour==='13').length,0);
   const minuteSum=own.reduce((sum,s)=>sum+(time(s.ends_at)-time(s.starts_at))/60000,0);assert.equal(minuteSum,660);
  }
  assert.ok(appointments.some(a=>Number(chileParts(slotById.get(a.slot_id).starts_at).hour)<12));
  assert.ok(appointments.some(a=>Number(chileParts(slotById.get(a.slot_id).starts_at).hour)>=14));
  assert.ok(appointments.every(a=>['reserved','confirmed'].includes(a.status)));
 }
 for(const slot of december){
  assert.equal(time(slot.ends_at)-time(slot.starts_at),30*60000);assert.equal(slot.duration_minutes,30);assert.equal(slotEnabled(data,slot),true);
  assert.equal(data.professionals.find(p=>p.id===slot.professional_id).service_id,slot.service_id);
  assert.equal(data.rooms.find(r=>r.id===slot.room_id).service_id,slot.service_id);
 }
 for(let i=0;i<data.slots.length;i++)for(let j=i+1;j<data.slots.length;j++){
  const a=data.slots[i],b=data.slots[j];if(a.room_id===b.room_id||a.professional_id===b.professional_id)assert.equal(overlaps(a,b),false,`resource conflict ${a.id} / ${b.id}`);
 }
 const occupied=data.appointments.filter(a=>active(a)||a.status==='completed');
 for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length;j++){
  const a=occupied[i],b=occupied[j];if(a.patient_id===b.patient_id)assert.equal(overlaps(slotById.get(a.slot_id),slotById.get(b.slot_id)),false,`patient conflict ${a.id} / ${b.id}`);
 }
 const completed=data.appointments.filter(a=>a.status==='completed');assert.equal(completed.length,39);
 for(const a of completed){const slot=slotById.get(a.slot_id);assert.equal(slot.dataset_section,'history');assert.ok(time(a.created_at)<time(a.confirmed_at)&&time(a.confirmed_at)<time(slot.starts_at));assert.ok(time(a.arrived_at)<=time(a.completed_at)&&time(a.completed_at)<=time(NOW));assert.ok(data.appointment_events.some(e=>e.appointment_id===a.id&&e.event==='completed'&&['admin','reception'].includes(e.actor_id)));}
 assert.equal(data.cancellations.length,6);assert.equal(data.waiting.length,3);assert.equal(data.offers.length,3);
 for(const offer of data.offers){
  assert.equal(offer.status,'pending');const slot=slotById.get(offer.slot_id),previous=data.appointments.find(a=>a.id===offer.old_appointment_id),request=data.waiting.find(w=>w.patient_id===offer.patient_id);
  assert.equal(previous.patient_id,offer.patient_id);assert.equal(slot.service_id,request.service_id);assert.equal(slotById.get(previous.slot_id).service_id,slot.service_id);assert.ok(time(slot.starts_at)<time(slotById.get(previous.slot_id).starts_at));assert.ok(time(offer.created_at)<time(offer.expires_at)&&time(offer.expires_at)<time(slot.starts_at));
  const beforeOffers={...data,offers:data.offers.filter(o=>o.id!==offer.id)};
  assert.ok(compatible(beforeOffers,slot,new Date(NOW)).some(w=>w.id===request.id));assert.ok(!data.appointments.some(a=>a.slot_id===slot.id&&active(a)));
 }
 assert.ok(data.notifications.every(n=>n.is_demo&&n.dataset_tag===DECEMBER_TAG));
}

test('December fixture is deterministic, tagged, coherent and exactly 528 usable slots with no resource/patient overlaps',()=>{
 const first=generateDecemberDataset();assert.deepEqual(first,generateDecemberDataset());validateDataset(first);
});

test('checked-in public JSON reproduces the fixed generator and contains only invented identifiers and contacts',async()=>{
 const checked=JSON.parse(await readFile('web/public/demo/december-2026.json','utf8'));assert.deepEqual(checked,generateDecemberDataset());
 const text=JSON.stringify(checked);assert.doesNotMatch(text,/@(?:gmail\.com|mayor\.cl)|service_role|sb_secret|password|rut/i);
});

test('demo reports use all daily slots, distinguish offers from occupation and exclude future attendance',async()=>{
 const {service:s}=fixture();s.setActor('admin');
 for(const [index,day] of DECEMBER_DAYS.entries()){
  const report=await s.rpc('get_report',{p_from:day,p_to:day});assert.equal(report.total_slots,176);assert.equal(report.reserved+report.confirmed,[120,126,114][index]);assert.equal(report.occupancy_rate,Math.round([120,126,114][index]/176*1000)/10);assert.equal(report.completed,0);assert.equal(report.arrived,0);assert.equal(report.no_show,0);assert.equal(report.recovered_slots,0);assert.equal(report.available_slots+report.pending_offers,[56,50,62][index]);
 }
 const snap=await s.load({from:DECEMBER_DAYS[0],to:DECEMBER_DAYS[2]});assert.equal(snap.pagination.total,528);assert.equal(snap.pagination.has_more,true);assert.equal(snap.slots.length,100);
 s.destroy();
});

test('all fictional balances reconcile to ledger, welcome/profile are once and future appointments have no attendance credit',async()=>{
 const f=fixture(),s=f.service;await s.load();const raw=f.state();
 for(const person of raw.profiles){
  s.setActor(person.id);const rewards=await s.rpc('get_my_rewards'),ledger=raw.reward_ledger.filter(r=>r.patient_id===person.id);
  assert.equal(ledger.filter(r=>r.action==='welcome').length,1);assert.equal(ledger.find(r=>r.action==='welcome').amount,5);assert.equal(rewards.balance,ledger.reduce((sum,r)=>sum+r.amount,0));assert.equal(rewards.awards.length,11);assert.equal(rewards.missions.length,6);
  assert.equal(rewards.validated_attendances,raw.appointments.filter(a=>a.patient_id===person.id&&a.status==='completed').length);
  for(const row of ledger.filter(r=>r.action==='attendance')){assert.ok(row.created_at<=NOW);assert.equal(raw.slots.find(slot=>slot.id===raw.appointments.find(a=>a.id===row.reference.appointment_id).slot_id).dataset_section,'history');}
 }
 const count=f.state().reward_ledger.length;await s.load();await s.load();assert.equal(f.state().reward_ledger.length,count);
 s.setActor('patient-a');let mine=await s.rpc('get_my_rewards');assert.equal(mine.level.id,'level-contigo');assert.equal(mine.balance,249);
 await s.rpc('save_accessibility_preferences',{p_preferences:{visual_mode:true}});assert.equal((await s.rpc('get_my_rewards')).balance,mine.balance);assert.equal((await s.load()).user.onboarded,false);
 await s.rpc('save_profile',{p_name:'Ana Ejemplo',p_last_name:'',p_phone:'',p_preferences:{visual_mode:true}});assert.equal((await s.rpc('get_my_rewards')).balance,mine.balance+3);
 await s.rpc('save_profile',{p_name:'Ana Actualizada',p_last_name:'',p_phone:'',p_preferences:{}});assert.equal((await s.rpc('get_my_rewards')).balance,mine.balance+3);
 s.destroy();
});

test('concurrent confirmations and rescheduling share one care-process credit; no client attendance or administrative writes',async()=>{
 const f=fixture(),s=f.service;s.setActor('patient-a');const appointment='demo-booking-2026-12-03-001';
 const before=await s.rpc('get_my_rewards');const attempts=await Promise.allSettled([s.rpc('change_appointment',{p_id:appointment,p_action:'confirm'}),s.rpc('change_appointment',{p_id:appointment,p_action:'confirm'})]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal((await s.rpc('get_my_rewards')).balance,before.balance+2);
 const snapshot=await s.load({from:'2026-12-03',to:'2026-12-05'}),current=snapshot.appointments.find(a=>a.id===appointment),originalSlot=snapshot.slots.find(slot=>slot.id===current.slot_id),alternative=snapshot.available.find(slot=>slot.service_id===originalSlot.service_id&&slot.id!==originalSlot.id);
 assert.ok(alternative);const id=await s.rpc('book_slot',{p_slot:alternative.id,p_old:appointment});await s.rpc('change_appointment',{p_id:id,p_action:'confirm'});assert.equal((await s.rpc('get_my_rewards')).balance,before.balance+2);
 const raw=f.state();assert.equal(raw.appointments.find(a=>a.id===id).care_process_id,current.care_process_id);assert.equal(raw.reward_ledger.filter(r=>r.action==='confirmation'&&r.reference.care_process_id===current.care_process_id).length,1);
 for(const [name,args] of [['adjust_coronitas',{p_user:'patient-a',p_amount:5,p_reason:'Motivo de prueba'}],['save_reward_rule',{p_key:'welcome',p_amount:99,p_reason:'Motivo de prueba'}],['correct_attendance',{p_appointment:'demo-history-booking-0-0',p_reason:'Motivo de prueba'}],['change_appointment',{p_id:id,p_action:'complete'}]])await assert.rejects(s.rpc(name,args));
 await assert.rejects(s.rpc('get_reward_history',{p_user:'patient-b'}));assert.equal((await s.rpc('get_my_rewards')).balance,before.balance+2);s.destroy();
});

test('attendance corrections append reversals, preserve earned badge history, pin amounts and cannot farm rewards',async()=>{
 const f=fixture(),s=f.service,appointment='demo-history-booking-3-0';s.setActor('demo-patient-004');const original=await s.rpc('get_my_rewards');assert.equal(original.validated_attendances,3);assert.equal(original.awards.find(a=>a.id==='mission-attendance-3').active,true);
 s.setActor('admin');await s.rpc('correct_attendance',{p_appointment:appointment,p_reason:'Registro validado por error'});await s.rpc('save_reward_rule',{p_key:'attendance',p_amount:50,p_reason:'Configuración de prueba futura'});
 s.setActor('demo-patient-004');const corrected=await s.rpc('get_my_rewards');assert.equal(corrected.balance,original.balance-10);assert.equal(corrected.validated_attendances,2);assert.equal(corrected.awards.find(a=>a.id==='mission-attendance-3').earned,true);assert.equal(corrected.awards.find(a=>a.id==='mission-attendance-3').active,false);
 const history=await s.rpc('get_reward_history'),reversal=history.items.find(r=>r.action==='attendance_correction');assert.ok(reversal.reversal_of);assert.equal(history.items.find(r=>r.id===reversal.reversal_of).amount,10);
 s.setActor('reception');await s.rpc('change_appointment',{p_id:appointment,p_action:'complete'});s.setActor('demo-patient-004');assert.equal((await s.rpc('get_my_rewards')).balance,original.balance);assert.equal((await s.rpc('get_my_rewards')).validated_attendances,3);
 s.setActor('admin');await assert.rejects(s.rpc('correct_attendance',{p_appointment:appointment,p_reason:'corto'}));await s.rpc('correct_attendance',{p_appointment:appointment,p_reason:'Segunda revisión de prueba'});await assert.rejects(s.rpc('correct_attendance',{p_appointment:appointment,p_reason:'Reintento de revisión de prueba'}));s.setActor('reception');await s.rpc('change_appointment',{p_id:appointment,p_action:'complete'});s.setActor('demo-patient-004');assert.equal((await s.rpc('get_my_rewards')).balance,original.balance);s.destroy();
});

test('demo community exports only opted-in alias/avatar totals, allows withdrawal, and admin people paginate separately',async()=>{
 const {service:s}=fixture();s.setActor('patient-a');let publicData=await s.rpc('get_reward_community');assert.equal(publicData.total,12);
 const allowed=['alias','avatar','balance','level','is_self'];for(const row of publicData.items)assert.deepEqual(Object.keys(row).sort(),allowed.sort());
 await s.rpc('save_community_preferences',{p_opt_in:false,p_alias:'',p_avatar:'heart'});assert.equal((await s.rpc('get_reward_community')).total,11);assert.ok((await s.rpc('get_my_rewards')).balance>0);
 await s.rpc('save_community_preferences',{p_opt_in:true,p_alias:'Ana jardín 12',p_avatar:'leaf'});assert.ok((await s.rpc('get_reward_community')).items.some(p=>p.alias==='Ana jardín 12'&&p.is_self));
 for(const alias of ['correo@example.invalid','Mi teléfono 912345678','http','www sitio'])await assert.rejects(s.rpc('save_community_preferences',{p_opt_in:true,p_alias:alias,p_avatar:'heart'}));
 await assert.rejects(s.rpc('get_people_rewards'));s.setActor('admin');const page=await s.rpc('get_people_rewards',{p_offset:0,p_limit:25});assert.equal(page.total,123);assert.equal(page.items.length,25);assert.equal(page.has_more,true);assert.ok(page.items.every(p=>p.is_demo));assert.ok(page.items.every((p,i,a)=>i===0||a[i-1].balance>=p.balance));
 assert.equal((await s.rpc('get_people_rewards',{p_query:'Ana',p_level:'level-contigo'})).items[0].id,'patient-a');s.destroy();
});

test('demo comments enforce moderation, word boundaries, ownership, staff-only replies and report review without points',async()=>{
 const f=fixture(),s=f.service,room='demo-room-1';s.setActor('patient-a');const balance=(await s.rpc('get_my_rewards')).balance;
 for(const body of ['WEÓN','w e o n','weeeooon','w30n','¡culiao!','s a c o d e w e a s'])await assert.rejects(s.rpc('post_room_comment',{p_room:room,p_body:body}));
 assert.equal(f.state().room_comments.length,0);const first=await s.rpc('post_room_comment',{p_room:room,p_body:'La computadora de la sala funciona bien.'});assert.equal((await s.rpc('get_room_comments',{p_room:room})).items[0].status,'published');
 await assert.rejects(s.rpc('post_room_comment',{p_room:room,p_body:'Otra observación válida.'}),/30 segundos/);
 s.setActor('patient-b');await assert.rejects(s.rpc('edit_room_comment',{p_id:first,p_body:'Edición ajena'}));await assert.rejects(s.rpc('post_room_comment',{p_room:room,p_body:'Respuesta no autorizada',p_parent:first}));
 await s.rpc('report_room_comment',{p_id:first,p_reason:'Revisar texto'});await s.rpc('report_room_comment',{p_id:first,p_reason:'Reintento de reporte'});assert.equal(f.state().comment_reports.length,1);
 s.setActor('admin');let queue=await s.rpc('get_comment_moderation',{p_status:'reported'});assert.equal(queue.total,1);await s.rpc('moderate_room_comment',{p_id:first,p_status:'hidden',p_reason:'Revisión de prueba pendiente'});assert.equal((await s.rpc('get_comment_moderation',{p_status:'reported'})).total,0);
 s.setActor('patient-a');await assert.rejects(s.rpc('edit_room_comment',{p_id:first,p_body:'No cambia la moderación'}));await s.rpc('withdraw_room_comment',{p_id:first});
 s.setActor('admin');await assert.rejects(s.rpc('moderate_room_comment',{p_id:first,p_status:'published',p_reason:'No debe volver a publicarse'}));const staffComment=await s.rpc('post_room_comment',{p_room:room,p_body:'El equipo revisa las observaciones de la sala.'});assert.ok(staffComment);
 s.setActor('patient-b');const parent=await s.rpc('post_room_comment',{p_room:room,p_body:'<img src=x onerror=alert(1)> La organización puede mejorar.'});s.setActor('reception');await s.rpc('post_room_comment',{p_room:room,p_body:'Gracias. Revisaremos la organización de la sala.',p_parent:parent});
 s.setActor('patient-b');const thread=(await s.rpc('get_room_comments',{p_room:room})).items.find(c=>c.id===parent);assert.match(thread.body,/<img/);assert.equal(thread.replies[0].is_staff,true);assert.equal(thread.replies[0].alias,'Equipo Medicita');assert.equal(thread.author_id,undefined);
 s.setActor('patient-a');assert.equal((await s.rpc('get_my_rewards')).balance,balance);s.destroy();
});

test('call flow keeps receipt/help/understood private, deduplicates retries and closes when appointment finishes',async()=>{
 const f=fixture(),s=f.service,appointment='demo-booking-2026-12-03-001';s.setActor('reception');await assert.rejects(s.rpc('call_to_box',{p_appointment:appointment}));
 const raw=f.state(),slot=raw.slots.find(slot=>slot.id===raw.appointments.find(a=>a.id===appointment).slot_id);await s.advanceTo(slot.starts_at);await s.rpc('register_arrival',{p_appointment:appointment});
 const request=randomUUID(),first=await s.rpc('call_to_box',{p_appointment:appointment,p_request_id:request}),retry=await s.rpc('call_to_box',{p_appointment:appointment,p_request_id:request});assert.equal(first,retry);assert.equal(f.state().box_calls.length,1);
 s.setActor('patient-b');assert.deepEqual(await s.rpc('get_box_calls'),[]);await assert.rejects(s.rpc('respond_box_call',{p_id:first,p_response:'help'}));
 s.setActor('patient-a');let call=(await s.rpc('get_box_calls'))[0];assert.equal(call.patient_name,undefined);assert.match(call.turn_code,/^T-[A-F0-9]{10}$/);await s.rpc('respond_box_call',{p_id:first,p_response:'received'});await s.rpc('respond_box_call',{p_id:first,p_response:'help'});await s.rpc('respond_box_call',{p_id:first,p_response:'received'});assert.equal((await s.rpc('get_box_calls'))[0].status,'help');
 const publicFeed=await s.rpc('get_public_box_calls');assert.equal(publicFeed.length,1);assert.deepEqual(Object.keys(publicFeed[0]).sort(),['turn_code','room_name','created_at','status'].sort());assert.equal(publicFeed[0].status,'calling');
 await s.rpc('respond_box_call',{p_id:first,p_response:'understood'});assert.deepEqual(await s.rpc('get_box_calls'),[]);assert.deepEqual(await s.rpc('get_public_box_calls'),[]);
 s.setActor('reception');call=(await s.rpc('get_box_calls'))[0];assert.equal(call.status,'understood');assert.match(call.patient_name,/Ana/);await s.rpc('change_appointment',{p_id:appointment,p_action:'complete'});assert.deepEqual(await s.rpc('get_box_calls'),[]);assert.ok((await s.rpc('get_box_calls',{p_pending_only:false}))[0].closed_at);s.destroy();
});

test('December actions persist in their own browser namespace and reset never changes the original demonstration',async()=>{
 const storage=storageFixture();storage.setItem('another-app-token','preserved');const original=createDemoService({storage,now:()=>new Date(NOW)});await original.load();const originalRaw=storage.getItem(DEMO_STORAGE_KEY);
 let s=createDemoService({storage,now:()=>new Date(NOW),dataset:generateDecemberDataset()});await s.load();s.setActor('patient-a');await s.rpc('save_accessibility_preferences',{p_preferences:{visual_mode:true}});s.destroy();s=createDemoService({storage,now:()=>new Date(NOW),dataset:generateDecemberDataset()});assert.equal((await s.load()).user.preferences.visual_mode,true);
 await s.reset();assert.equal((await s.load()).user.id,'patient-a');assert.equal(storage.getItem(DEMO_STORAGE_KEY),originalRaw);assert.equal(storage.getItem('another-app-token'),'preserved');assert.equal((await s.rpc('get_my_rewards')).balance,249);original.destroy();s.destroy();
});

test('the actual SQL generator matches JS invariants; seed reload is idempotent and reset/retire are admin-only and isolated',async()=>{
 const db=new PGlite(),admin=randomUUID(),patient=randomUUID();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  await db.exec(await readFile('supabase/migrations/20261116033253_contigo.sql','utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[admin,'admin-fixture@example.invalid',patient,'patient-fixture@example.invalid']);await db.query("update profiles set role='admin' where id=$1",[admin]);
  const before=(await db.query('select jsonb_agg(to_jsonb(p) order by id) as value from profiles p')).rows[0].value;
  await db.exec(await readFile('supabase/migrations/20261124210142_contigo_dataset_diciembre_20261124.sql','utf8'));
  const generated=(await db.query('select app_private.build_demo_december_dataset($1::timestamptz) as value',[NOW])).rows[0].value;validateDataset(generated);
  const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,val])=>[key,normalize(val)])):typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)?new Date(value).toISOString():value;
  assert.deepEqual(normalize(generated),normalize(generateDecemberDataset()));
  const payload=(await db.query('select payload from demonstration_sets')).rows[0].payload;await db.exec(await readFile('supabase/demo-december-2026.sql','utf8'));await db.exec(await readFile('supabase/demo-december-2026.sql','utf8'));assert.deepEqual((await db.query('select payload from demonstration_sets')).rows[0].payload,payload);assert.equal((await db.query('select count(*)::int as n from demonstration_sets')).rows[0].n,1);
  async function as(user,sql,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`);return db.query(sql,args);}
  assert.equal((await as(null,'select get_demo_dataset() as value')).rows[0].value.dataset_tag,DECEMBER_TAG);await assert.rejects(as(null,"select manage_demo_dataset('retire')"));await assert.rejects(as(patient,"select manage_demo_dataset('reset')"));await assert.rejects(as(patient,'select app_private.build_demo_december_dataset()'));
  assert.equal((await as(patient,'select count(*)::int as n from demonstration_sets')).rows[0].n,0);await assert.rejects(as(patient,'delete from demonstration_sets'));
  await as(admin,"select manage_demo_dataset('retire')");assert.equal((await as(null,'select get_demo_dataset() as value')).rows[0].value,null);await as(admin,"select manage_demo_dataset('reset')");assert.equal((await as(null,'select get_demo_dataset() as value')).rows[0].value.dataset_tag,DECEMBER_TAG);await assert.rejects(as(admin,"select manage_demo_dataset('retire','otro-proyecto')"));
  await db.exec('reset role');assert.equal((await db.query('select revision from demonstration_sets')).rows[0].revision,3);assert.equal((await db.query("select count(*)::int as n from audit_log where event like 'demo_dataset_%'")).rows[0].n,2);
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(p) order by id) as value from profiles p')).rows[0].value,before);assert.equal((await db.query('select count(*)::int as n from slots')).rows[0].n,0);assert.equal((await db.query('select count(*)::int as n from appointments')).rows[0].n,0);
 }finally{await db.close();}
});
