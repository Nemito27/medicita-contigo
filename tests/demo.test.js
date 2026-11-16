import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoService,DEMO_STORAGE_KEY} from '../web/src/services/demo.js';
import {dayKey,addDays,chileTime,time} from '../web/src/services/demo/model.js';

function fixture(at='2026-11-16T12:00:00Z') {
  const entries=new Map();const storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
  let instant=new Date(at);
  const service=createDemoService({storage,now:()=>instant});
  return {service,storage,entries,clock:value=>instant=new Date(value),state:()=>JSON.parse(storage.getItem(DEMO_STORAGE_KEY))};
}
const scenarioFilters=data=>{const s=data.slots.find(s=>s.id==='slot-recovery');return {from:dayKey(s.starts_at),to:addDays(dayKey(s.starts_at),9)}};

test('demo scenario: cancellation, supervised offer, acceptance and actual used recovery',async()=>{
  const f=fixture(),s=f.service,initial=await s.load(),filters=scenarioFilters(initial);
  assert.equal(initial.user.id,'patient-a');assert.equal(initial.user.role,'patient');
  await s.rpc('change_appointment',{p_id:'appointment-a',p_action:'cancel',p_reason:'Problema de horario'});
  await assert.rejects(s.rpc('change_appointment',{p_id:'appointment-a',p_action:'cancel'}),/ya no puede/);
  s.setActor('admin');
  assert.ok((await s.load(filters)).available.some(x=>x.id==='slot-recovery'));
  const candidates=await s.rpc('compatible_candidates',{p_slot:'slot-recovery'});
  assert.equal(candidates[0].id,'wait-b');
  const offer=await s.rpc('make_offer',{p_slot:'slot-recovery',p_wait:'wait-b'});
  s.setActor('patient-a');
  assert.equal((await s.load(filters)).offers.length,0);
  await assert.rejects(s.rpc('respond_offer',{p_id:offer,p_accept:true}),/no está disponible/);
  s.setActor('patient-b');
  const inbox=await s.load(filters);
  assert.ok(inbox.notifications.some(n=>n.kind==='offer'&&n.offer_id===offer));
  assert.equal(inbox.appointments.find(a=>a.id==='appointment-b-later').status,'confirmed');
  const nextId=await s.rpc('respond_offer',{p_id:offer,p_accept:true});
  const patient=await s.load(filters),next=patient.appointments.find(a=>a.id===nextId);
  assert.equal(patient.appointments.find(a=>a.id==='appointment-b-later').status,'cancelled');
  assert.equal(next.status,'confirmed');assert.equal(patient.waiting.length,0);
  s.setActor('admin');
  let metrics=await s.rpc('get_report',{p_from:filters.from,p_to:filters.to});
  assert.equal(metrics.reassigned_slots,1);assert.equal(metrics.recovered_slots,0);
  const slot=(await s.load(filters)).slots.find(x=>x.id==='slot-recovery');
  await s.advanceTo(slot.starts_at);
  s.setActor('reception');
  await s.rpc('register_arrival',{p_token:next.checkin_token});
  await assert.rejects(s.rpc('register_arrival',{p_token:next.checkin_token}),/ya fue utilizada/);
  await s.rpc('change_appointment',{p_id:next.id,p_action:'complete'});
  metrics=await s.rpc('get_report',{p_from:filters.from,p_to:filters.to});
  assert.equal(metrics.recovered_slots,1);assert.equal(metrics.completed,1);
  assert.equal((await s.load(filters)).rooms.find(r=>r.id==='room-general').status,'transition');
});

test('failed rescheduling is atomic, direct booking stays reserved and simultaneous attempts cannot duplicate',async()=>{
  const f=fixture(),s=f.service;await s.load();
  const before=JSON.stringify(f.state());
  await assert.rejects(s.rpc('book_slot',{p_slot:'slot-b-later',p_old:'appointment-a'}),/ya no está disponible/);
  assert.equal(JSON.stringify(f.state()),before);
  const results=await Promise.allSettled([s.rpc('book_slot',{p_slot:'slot-general-free'}),s.rpc('book_slot',{p_slot:'slot-general-free'})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const current=await s.load();assert.equal(current.appointments.find(a=>a.slot_id==='slot-general-free').status,'reserved');
  await s.rpc('book_slot',{p_slot:'slot-general-alternative',p_old:'appointment-a'});
  assert.equal((await s.load()).appointments.find(a=>a.id==='appointment-a').status,'cancelled');
});

test('expired offers release the slot safely while preserving the previous reservation',async()=>{
  const {service:s}=fixture();await s.load();
  await s.rpc('change_appointment',{p_id:'appointment-a',p_action:'cancel'});s.setActor('admin');
  const id=await s.rpc('make_offer',{p_slot:'slot-recovery',p_wait:'wait-b'});
  const offer=(await s.load()).offers.find(o=>o.id===id);
  await s.advanceTo(new Date(time(offer.expires_at)+1000).toISOString());
  const admin=await s.load();assert.equal(admin.offers.find(o=>o.id===id).status,'expired');
  assert.ok(admin.available.some(s=>s.id==='slot-recovery'));
  s.setActor('patient-b');
  await assert.rejects(s.rpc('respond_offer',{p_id:id,p_accept:true}),/no está disponible/);
  assert.equal((await s.load()).appointments.find(a=>a.id==='appointment-b-later').status,'confirmed');
});

test('patient isolation, role restrictions and supervisor aggregation survive actor changes',async()=>{
  const {service:s}=fixture();
  const a=await s.load();assert.ok(a.appointments.every(x=>x.patient_id==='patient-a'));assert.equal(a.profiles.length,1);assert.equal(a.audit_log.length,0);assert.equal(a.report,null);
  await assert.rejects(s.rpc('set_room',{p_id:'room-general',p_status:'busy'}),/personal autorizado/);
  await assert.rejects(s.rpc('save_resource',{p_kind:'setting',p_data:{offer_minutes:30}}),/Solo administración/);
  await assert.rejects(s.rpc('change_appointment',{p_id:'appointment-b-later',p_action:'cancel'}),/No puedes/);
  await assert.rejects(s.rpc('get_report',{}),/personal autorizado/);
  s.setActor('reception');await assert.rejects(s.rpc('set_user_role',{p_user:'patient-a',p_role:'admin'}),/Solo administración/);
  s.setActor('supervisor');const view=await s.load();assert.equal(view.profiles.length,0);assert.equal(view.appointments.length,0);assert.equal(view.waiting.length,0);assert.ok(view.report);assert.ok(view.audit_log.every(row=>!row.patient_id&&!row.actor_id&&!row.appointment_id));
  await assert.rejects(s.rpc('book_slot',{p_slot:'slot-general-free'}),/supervisor/);
  await assert.rejects(s.rpc('compatible_candidates',{p_slot:'slot-general-free'}),/personal autorizado/);
  s.setActor('admin');await assert.rejects(s.rpc('set_user_role',{p_user:'admin',p_role:'patient'}),/propio rol/);
});

test('preferences restrict compatible candidates by whole interval, weekday, period and consent',async()=>{
  const {service:s}=fixture();const initial=await s.load(),slot=initial.slots.find(x=>x.id==='slot-recovery');
  await s.rpc('change_appointment',{p_id:'appointment-a',p_action:'cancel'});s.setActor('patient-b');
  const start=new Date(time(slot.starts_at)-3600000).toISOString();
  await s.rpc('join_waitlist',{p_id:'wait-b',p_service:'service-general',p_earliest:start,p_latest:new Date(time(slot.starts_at)+10*60000).toISOString(),p_days:[2],p_period:'morning',p_old:'appointment-b-later',p_receive_offers:true});
  s.setActor('admin');assert.equal((await s.rpc('compatible_candidates',{p_slot:slot.id})).length,0);
  s.setActor('patient-b');
  await s.rpc('join_waitlist',{p_id:'wait-b',p_service:'service-general',p_earliest:start,p_latest:new Date(time(slot.ends_at)+3600000).toISOString(),p_days:[3],p_period:'morning',p_old:'appointment-b-later',p_receive_offers:true});
  s.setActor('admin');assert.equal((await s.rpc('compatible_candidates',{p_slot:slot.id})).length,0);
  s.setActor('patient-b');
  await s.rpc('join_waitlist',{p_id:'wait-b',p_service:'service-general',p_earliest:start,p_latest:new Date(time(slot.ends_at)+3600000).toISOString(),p_days:[2],p_period:'morning',p_old:'appointment-b-later',p_receive_offers:true});
  s.setActor('admin');assert.equal((await s.rpc('compatible_candidates',{p_slot:slot.id})).length,1);
  s.setActor('patient-b');await s.rpc('save_profile',{p_name:'Luis',p_last_name:'Demostración B',p_phone:'',p_preferences:{receive_offers:false,reminder_hours:[]}});
  s.setActor('admin');assert.equal((await s.rpc('compatible_candidates',{p_slot:slot.id})).length,0);
});

test('variable durations, real overlap boundaries, work schedules and blocks are enforced',async()=>{
  const {service:s}=fixture();const initial=await s.load(),day=addDays(dayKey(initial.slots.find(s=>s.id==='slot-recovery').starts_at),2);s.setActor('admin');
  const common={p_room:'room-general',p_professional:'professional-general',p_service:'service-general'};
  const id=await s.rpc('create_slot',{...common,p_start:chileTime(day,10),p_duration:20});
  await assert.rejects(s.rpc('create_slot',{...common,p_start:chileTime(day,10,15),p_duration:15}),/superpone/);
  await s.rpc('create_slot',{...common,p_start:chileTime(day,10,20),p_duration:45});
  await assert.rejects(s.rpc('create_slot',{...common,p_start:chileTime(day,19),p_duration:20}),/horario de trabajo/);
  await s.rpc('save_resource',{p_kind:'block',p_data:{professional_id:'professional-general',starts_at:chileTime(day,12),ends_at:chileTime(day,13),reason:'Ausencia de prueba'}});
  await assert.rejects(s.rpc('create_slot',{...common,p_start:chileTime(day,12,10),p_duration:15}),/bloqueada/);
  const view=await s.load({from:day,to:day});assert.equal(view.slots.find(s=>s.id===id).duration_minutes,20);
});

test('no-show waits until appointment end plus grace and future bookings do not inflate absence rates',async()=>{
  const {service:s}=fixture();const initial=await s.load(),slot=initial.slots.find(s=>s.id==='slot-recovery'),day=dayKey(slot.starts_at);s.setActor('admin');
  await assert.rejects(s.rpc('change_appointment',{p_id:'appointment-a',p_action:'no_show'}),/después del término/);
  await s.advanceTo(new Date(time(slot.ends_at)+14*60000).toISOString());
  await assert.rejects(s.rpc('change_appointment',{p_id:'appointment-a',p_action:'no_show'}),/después del término/);
  await s.advanceTo(new Date(time(slot.ends_at)+15*60000).toISOString());
  await s.rpc('change_appointment',{p_id:'appointment-a',p_action:'no_show'});
  const r=await s.rpc('get_report',{p_from:day,p_to:addDays(day,9)});assert.equal(r.no_show,1);assert.equal(r.no_show_rate,100);assert.equal(r.confirmed,1);
});

test('notifications are private, maintenance reminders are idempotent and reset is isolated and reproducible',async()=>{
  const f=fixture(),s=f.service,first=await s.load();
  const own=first.notifications[0];await s.rpc('mark_notification',{p_id:own.id,p_read:true});assert.ok((await s.load()).notifications.find(n=>n.id===own.id).read_at);
  s.setActor('patient-b');await assert.rejects(s.rpc('mark_notification',{p_id:own.id,p_read:true}),/en tu cuenta/);
  s.setActor('patient-a');const count=(await s.load()).notifications.length;await s.load();assert.equal((await s.load()).notifications.length,count);
  await s.rpc('change_appointment',{p_id:'appointment-a',p_action:'cancel'});
  await s.reset();assert.equal(s.getActor(),'patient-a');assert.equal((await s.load()).appointments.find(a=>a.id==='appointment-a').status,'reserved');
  assert.ok([...f.entries.keys()].every(key=>key.startsWith(DEMO_STORAGE_KEY)));
  assert.equal(f.entries.has('medicita-demo'),false);
});

test('queued requests retain their requesting identity when the presenter changes actor immediately',async()=>{
  const {service:s}=fixture();await s.load();
  const request=s.rpc('book_slot',{p_slot:'slot-general-free'});
  s.setActor('patient-b');
  const id=await request;
  assert.equal((await s.load()).appointments.some(a=>a.id===id),false);
  s.setActor('patient-a');
  assert.equal((await s.load()).appointments.find(a=>a.id===id).patient_id,'patient-a');
});

test('existing slots stop being bookable after professional or room service changes',async()=>{
  for(const edit of [
    {p_kind:'professional',p_data:{id:'professional-general',full_name:'Profesional de prueba · Medicina',service_id:'service-dental',active:true}},
    {p_kind:'room',p_data:{id:'room-general',name:'Box 1',service_id:'service-dental',active:true}},
  ]){
    const {service:s}=fixture();await s.load();s.setActor('admin');
    await s.rpc('save_resource',edit);
    assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),false);
    s.setActor('patient-a');
    await assert.rejects(s.rpc('book_slot',{p_slot:'slot-general-free',p_old:'appointment-a'}),/ya no está disponible/);
    assert.equal((await s.load()).appointments.find(a=>a.id==='appointment-a').status,'reserved');
  }
});

test('existing slots revalidate edited work hours and disabled schedules',async()=>{
  const {service:s}=fixture();await s.load();s.setActor('admin');
  const snapshot=await s.load(),slot=snapshot.slots.find(slot=>slot.id==='slot-general-free');
  const schedule=snapshot.schedules.find(schedule=>schedule.professional_id===slot.professional_id&&schedule.weekday===2);
  await s.rpc('save_resource',{p_kind:'schedule',p_data:{...schedule,end_time:'11:00',active:true}});
  assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),false);
  s.setActor('patient-a');await assert.rejects(s.rpc('book_slot',{p_slot:slot.id}),/ya no está disponible/);
  s.setActor('admin');
  await s.rpc('save_resource',{p_kind:'schedule',p_data:{...schedule,active:false}});
  assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),false);
  await assert.rejects(s.rpc('create_slot',{p_room:slot.room_id,p_professional:slot.professional_id,p_service:slot.service_id,p_start:chileTime(dayKey(slot.starts_at),16),p_duration:20}),/horario de trabajo/);
  await s.rpc('save_resource',{p_kind:'schedule',p_data:{...schedule,active:true}});
  assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),true);
});

test('blocks match either selected resource and inactive blocks release availability',async()=>{
  const {service:s}=fixture();await s.load();s.setActor('admin');
  const slot=(await s.load()).slots.find(slot=>slot.id==='slot-general-free');
  const block={professional_id:slot.professional_id,room_id:'room-dental',starts_at:slot.starts_at,ends_at:slot.ends_at,reason:'Bloqueo ficticio de recursos',active:true};
  const id=await s.rpc('save_resource',{p_kind:'block',p_data:block});
  assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),false);
  await s.rpc('save_resource',{p_kind:'block',p_data:{...block,id,active:false}});
  assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),true);
  await s.rpc('save_resource',{p_kind:'block',p_data:{...block,id,professional_id:'professional-dental',room_id:slot.room_id,active:true}});
  assert.equal((await s.load()).available.some(slot=>slot.id==='slot-general-free'),false);
  await s.rpc('save_resource',{p_kind:'block',p_data:{...block,id,active:false}});
  s.setActor('patient-a');
  assert.ok(await s.rpc('book_slot',{p_slot:slot.id}));
});

test('morning preferences cover the whole slot and accept an appointment ending at noon',async()=>{
  const {service:s}=fixture();const initial=await s.load(),day=dayKey(initial.slots.find(slot=>slot.id==='slot-recovery').starts_at);
  s.setActor('admin');
  const common={p_room:'room-general',p_professional:'professional-general',p_service:'service-general'};
  const crossing=await s.rpc('create_slot',{...common,p_start:chileTime(addDays(day,2),11,45),p_duration:45});
  const beforeNoon=await s.rpc('create_slot',{...common,p_start:chileTime(addDays(day,3),11,30),p_duration:30});
  s.setActor('patient-b');
  await s.rpc('join_waitlist',{p_id:'wait-b',p_service:'service-general',p_earliest:chileTime(day,0),p_latest:chileTime(addDays(day,6),23,59),p_days:[1,2,3,4,5,6,7],p_period:'morning',p_old:'appointment-b-later',p_receive_offers:true});
  s.setActor('admin');
  assert.equal((await s.rpc('compatible_candidates',{p_slot:crossing})).length,0);
  assert.equal((await s.rpc('compatible_candidates',{p_slot:beforeNoon})).length,1);
});
