export const DEMO_KEY = 'medicita-contigo-demo-v2';
export const ACTORS = ['patient-a', 'patient-b', 'admin', 'reception', 'supervisor'];
export const ROLES = ['patient', 'reception', 'admin', 'supervisor'];
export const ACTIVE = ['reserved', 'confirmed', 'arrived'];
export const OCCUPIED = [...ACTIVE, 'completed', 'no_show'];
export const clone = value => structuredClone(value);
export const uid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16)});
export const iso = value => new Date(value).toISOString();
export const time = value => new Date(value).getTime();
export function dayKey(value) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function addDays(key,n) {return new Date(Date.parse(`${key}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);}
export function chileParts(value) {return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
export function chileTime(key,hour=10,minute=0) {
  const target=`${key}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  const raw=Date.parse(`${target}:00Z`);
  for (const offset of [3,4]) {const candidate=new Date(raw+offset*3600000);const p=chileParts(candidate);if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===target) return candidate.toISOString();}
  throw Error('La hora seleccionada no existe en la zona horaria de Chile.');
}
export function weekday(value) {return new Date(`${dayKey(value)}T12:00:00Z`).getUTCDay()||7;}
export function overlaps(a,b) {return time(a.starts_at)<time(b.ends_at)&&time(a.ends_at)>time(b.starts_at);}
export const fullName = profile => [profile?.full_name,profile?.last_name].filter(Boolean).join(' ');
export const preferences = () => ({simple_mode:false,high_contrast:false,reduce_motion:false,reminder_hours:[48,24,2],receive_offers:true});

export function seed(baseNow) {
  const created=iso(baseNow), today=dayKey(baseNow);
  let scenarioDay=addDays(today,1);
  while (weekday(chileTime(scenarioDay,12))!==2) scenarioDay=addDays(scenarioDay,1);
  const historyDay=addDays(today,-3);
  const profile=(id,name,last_name,role)=>({id,full_name:name,last_name,phone:'',email:`${id}@example.invalid`,role,preferences:preferences(),onboarded:true,created_at:created});
  const profiles=[profile('patient-a','Ana','Demostración A','patient'),profile('patient-b','Luis','Demostración B','patient'),profile('admin','Administración','Demostración','admin'),profile('reception','Recepción','Demostración','reception'),profile('supervisor','Supervisión','Demostración','supervisor')];
  const services=[{id:'service-general',name:'Medicina general',duration_minutes:30,active:true},{id:'service-dental',name:'Odontología',duration_minutes:45,active:true},{id:'service-nursing',name:'Enfermería',duration_minutes:20,active:true}];
  const rooms=[{id:'room-general',name:'Box 1',service_id:'service-general',specialty:'Medicina general',status:'free',active:true,updated_at:created},{id:'room-dental',name:'Box 2',service_id:'service-dental',specialty:'Odontología',status:'busy',active:true,updated_at:created},{id:'room-nursing',name:'Box 3',service_id:'service-nursing',specialty:'Enfermería',status:'transition',active:true,updated_at:created}];
  const professionals=[{id:'professional-general',full_name:'Profesional de prueba · Medicina',service_id:'service-general',active:true},{id:'professional-dental',full_name:'Profesional de prueba · Odontología',service_id:'service-dental',active:true},{id:'professional-nursing',full_name:'Profesional de prueba · Enfermería',service_id:'service-nursing',active:true}];
  function slot(id,key,hour,minute=0,serviceId='service-general') {const s=services.find(x=>x.id===serviceId),p=professionals.find(x=>x.service_id===serviceId),r=rooms.find(x=>x.specialty===s.name),start=chileTime(key,hour,minute);return {id,room_id:r.id,professional_id:p.id,service_id:s.id,specialty:s.name,professional:p.full_name,starts_at:start,ends_at:iso(time(start)+s.duration_minutes*60000),duration_minutes:s.duration_minutes,blocked:false,created_at:created};}
  const slots=[slot('slot-recovery',scenarioDay,10,30),slot('slot-general-free',scenarioDay,11,30),slot('slot-general-alternative',addDays(scenarioDay,1),9),slot('slot-b-later',addDays(scenarioDay,7),14),slot('slot-dental-free',scenarioDay,11,0,'service-dental'),slot('slot-nursing-free',addDays(scenarioDay,1),10,0,'service-nursing'),slot('slot-history-completed',addDays(today,-1),10),slot('slot-history-no-show',addDays(today,-2),14,0,'service-dental'),slot('slot-history-recovered',historyDay,11)];
  const appointment=(id,slotId,patient,status,extra={})=>({id,slot_id:slotId,patient_id:patient,status,checkin_token:uid(),created_at:iso(time(slots.find(s=>s.id===slotId).starts_at)-7*86400000),confirmed_at:null,arrived_at:null,completed_at:null,cancelled_at:null,no_show_at:null,cancellation_reason:null,released_at:null,...extra});
  const history=slots.find(s=>s.id==='slot-history-recovered');
  const released=iso(time(history.starts_at)-2*86400000),reassigned=iso(time(released)+45*60000);
  const appointments=[appointment('appointment-a','slot-recovery','patient-a','reserved'),appointment('appointment-b-later','slot-b-later','patient-b','confirmed',{confirmed_at:created}),appointment('appointment-history-a','slot-history-completed','patient-a','completed',{confirmed_at:created,arrived_at:chileTime(addDays(today,-1),9,55),completed_at:chileTime(addDays(today,-1),10,30)}),appointment('appointment-history-no-show','slot-history-no-show','patient-a','no_show',{no_show_at:chileTime(addDays(today,-2),15)}),appointment('appointment-history-cancelled','slot-history-recovered','patient-a','cancelled',{cancelled_at:released,released_at:released,cancellation_reason:'Problema de horario'}),appointment('appointment-history-recovered','slot-history-recovered','patient-b','completed',{created_at:reassigned,confirmed_at:reassigned,arrived_at:history.starts_at,completed_at:history.ends_at})];
  const waiting=[{id:'wait-b',patient_id:'patient-b',service_id:'service-general',specialty:'Medicina general',earliest:chileTime(addDays(today,1),0),latest:chileTime(addDays(scenarioDay,6),23,59),preferred_days:[1,2,3,4,5,6,7],preferred_period:'any',old_appointment_id:'appointment-b-later',receive_offers:true,created_at:iso(time(baseNow)-86400000)}];
  const cancellations=[{id:'cancellation-history',appointment_id:'appointment-history-cancelled',slot_id:history.id,patient_id:'patient-a',released_at:released,reason:'Problema de horario',notice_minutes:2880,reassigned_at:reassigned,used_at:history.ends_at}];
  const notifications=profiles.map(p=>({id:`welcome-${p.id}`,patient_id:p.id,kind:'welcome',title:'Estamos Con Tigo',body:'Estos datos son ficticios. Puedes cambiar de personaje para recorrer la demostración.',created_at:created,read_at:null,appointment_id:null,offer_id:null,dedupe_key:`welcome-${p.id}`}));
  const schedules=professionals.flatMap(p=>Array.from({length:7},(_,i)=>({id:`schedule-${p.id}-${i+1}`,professional_id:p.id,room_id:rooms.find(r=>r.specialty===services.find(s=>s.id===p.service_id).name).id,weekday:i+1,start_time:'08:00',end_time:'18:00'})));
  return {version:2,revision:0,clock_offset_ms:0,center:{id:'center-demo',name:'Centro de demostración Medicita Contigo',address:'Ubicación de prueba · sin vínculo institucional',independent:true},settings:{cancellation_notice_minutes:0,no_show_grace_minutes:15,offer_minutes:60,early_cancellation_hours:24},profiles,rooms,services,professionals,slots,appointments,waiting,offers:[],notifications,notification_deliveries:[],appointment_events:[{id:'event-history',appointment_id:'appointment-history-recovered',slot_id:history.id,patient_id:'patient-b',actor_id:'admin',event:'completed',created_at:history.ends_at,detail:'Atención ficticia finalizada'}],audit_log:[{id:'audit-seed',actor_id:'admin',event:'demo_reset',created_at:created,detail:'Entorno de demostración con datos ficticios'}],cancellations,schedules,schedule_exceptions:[],created_at:created};
}

export function actorProfile(state,actor) {const profile=state.profiles.find(p=>p.id===actor);if(!profile)throw Error('El personaje de demostración no está disponible. Reinicia la demostración.');return profile;}
export function audit(state,actor,event,detail={},now) {const row={id:uid(),actor_id:actor,event,created_at:iso(now),detail:typeof detail==='string'?detail:detail.detail||'',...(typeof detail==='object'?detail:{})};state.audit_log.push(row);return row;}
export function appointmentEvent(state,actor,event,a,now,detail='') {const row={id:uid(),appointment_id:a.id,slot_id:a.slot_id,patient_id:a.patient_id,actor_id:actor,event,created_at:iso(now),detail};state.appointment_events.push(row);audit(state,actor,event,{appointment_id:a.id,slot_id:a.slot_id,patient_id:a.patient_id,detail},now);}
export function notify(state,userId,kind,title,body,now,extra={}) {if(extra.dedupe_key&&state.notifications.some(n=>n.dedupe_key===extra.dedupe_key))return;const row={id:uid(),patient_id:userId,kind,title,body,created_at:iso(now),read_at:null,appointment_id:null,offer_id:null,...extra};state.notifications.push(row);state.notification_deliveries.push({id:uid(),notification_id:row.id,channel:'internal',status:'delivered',created_at:iso(now),attempts:1});return row;}
export function maintenance(state,now) {
  let changed=false;
  for(const offer of state.offers)if(offer.status==='pending'&&time(offer.expires_at)<=time(now)){offer.status='expired';offer.responded_at=iso(now);audit(state,'system','offer_expired',{offer_id:offer.id,slot_id:offer.slot_id,patient_id:offer.patient_id},now);notify(state,offer.patient_id,'offer_expired','La oferta venció','Tu reserva anterior se mantiene. Puedes seguir recibiendo nuevas oportunidades.',now,{offer_id:offer.id,dedupe_key:`expired:${offer.id}`});changed=true;}
  for(const a of state.appointments.filter(a=>ACTIVE.includes(a.status)&&a.status!=='arrived')){const slot=state.slots.find(s=>s.id===a.slot_id),profile=state.profiles.find(p=>p.id===a.patient_id);if(!slot||time(slot.starts_at)<=time(now))continue;for(const hours of profile?.preferences?.reminder_hours||[]){const remaining=(time(slot.starts_at)-time(now))/3600000;if(remaining<=hours){const key=`reminder:${a.id}:${hours}`;if(!state.notifications.some(n=>n.dedupe_key===key)){notify(state,a.patient_id,'reminder','Recuerda tu próxima atención','Ingresa a Medicita Contigo para revisar los detalles o avisar si no podrás asistir.',now,{appointment_id:a.id,dedupe_key:key});changed=true;}}}}
  return changed;
}

export function resourceBlocked(state,slot) {
  return state.schedule_exceptions.some(block=>block.active!==false&&
    (block.professional_id===slot.professional_id||block.room_id===slot.room_id)&&overlaps(block,slot));
}
export function scheduleAllows(state,slot) {
  const schedules=state.schedules.filter(schedule=>schedule.professional_id===slot.professional_id&&schedule.active!==false);
  if(!schedules.length)return true;
  if(dayKey(slot.starts_at)!==dayKey(slot.ends_at))return false;
  const start=chileParts(slot.starts_at),end=chileParts(slot.ends_at);
  return schedules.some(schedule=>schedule.room_id===slot.room_id&&Number(schedule.weekday)===weekday(slot.starts_at)&&
    `${start.hour}:${start.minute}`>=schedule.start_time.slice(0,5)&&`${end.hour}:${end.minute}`<=schedule.end_time.slice(0,5));
}
// Existing slots must reflect current resources, hours and blocks, not only the
// configuration that happened to be valid when the slot was created.
export function slotEnabled(state,slot) {
  if(!slot||slot.blocked)return false;
  const service=state.services.find(value=>value.id===slot.service_id&&value.active!==false);
  const professional=state.professionals.find(value=>value.id===slot.professional_id&&value.active!==false);
  const room=state.rooms.find(value=>value.id===slot.room_id&&value.active!==false);
  return Boolean(service&&professional&&room&&professional.service_id===service.id&&room.specialty===service.name&&
    !resourceBlocked(state,slot)&&scheduleAllows(state,slot));
}
export function isAvailable(state,slot,now,{ignoreOffer=null}={}) {return Boolean(slotEnabled(state,slot)&&time(slot.starts_at)>time(now)&&!state.appointments.some(a=>a.slot_id===slot.id&&OCCUPIED.includes(a.status))&&!state.offers.some(o=>o.id!==ignoreOffer&&o.slot_id===slot.id&&o.status==='pending'&&time(o.expires_at)>time(now)));}
export function patientConflict(state,patientId,slot,ignoreAppointment=null) {return state.appointments.some(a=>a.patient_id===patientId&&a.id!==ignoreAppointment&&OCCUPIED.includes(a.status)&&overlaps(state.slots.find(s=>s.id===a.slot_id),slot));}
export function compatible(state,slot,now) {
  if(!isAvailable(state,slot,now))return [];
  const start=chileParts(slot.starts_at),end=chileParts(slot.ends_at);
  const morning=Number(start.hour)<12&&dayKey(slot.starts_at)===dayKey(slot.ends_at)&&`${end.hour}:${end.minute}`<='12:00';
  return state.waiting.filter(w=>{const p=state.profiles.find(x=>x.id===w.patient_id);const old=w.old_appointment_id&&state.appointments.find(a=>a.id===w.old_appointment_id);return p?.role==='patient'&&w.service_id===slot.service_id&&w.receive_offers!==false&&p.preferences?.receive_offers!==false&&time(w.earliest)<=time(slot.starts_at)&&time(w.latest)>=time(slot.ends_at)&&(w.preferred_days||[1,2,3,4,5,6,7]).includes(weekday(slot.starts_at))&&(w.preferred_period==='any'||!w.preferred_period||(w.preferred_period==='morning'?morning:Number(start.hour)>=12))&&(!w.old_appointment_id||(old&&['reserved','confirmed'].includes(old.status)&&time(state.slots.find(s=>s.id===old.slot_id)?.starts_at)>time(slot.starts_at)))&&!patientConflict(state,w.patient_id,slot,w.old_appointment_id)&&!state.offers.some(o=>o.patient_id===w.patient_id&&o.status==='pending'&&time(o.expires_at)>time(now));}).sort((a,b)=>time(a.created_at)-time(b.created_at)).map(w=>({...w,patient_name:fullName(state.profiles.find(p=>p.id===w.patient_id))}));
}
