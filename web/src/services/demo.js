// Fictitious browser-local demonstration. This module never imports the live API.
import {DEMO_KEY,ACTORS,clone,seed,actorProfile,fullName,iso,time,dayKey,addDays,maintenance,isAvailable,slotEnabled} from './demo/model.js';
import {execute} from './demo/operations.js';
import {report} from './demo/report.js';
import {initializeRewards,syncRewards,myRewards,peopleRewards,community,executeRewards,REWARD_RPCS} from './demo/rewards.js';
import {initializeCommunications,boxCalls,closeFinishedCalls,executeCommunications,COMMUNICATION_RPCS} from './demo/communications.js';

export const DEMO_STORAGE_KEY=DEMO_KEY;
let queue=Promise.resolve();
const serialize=task=>{const result=queue.then(task,task);queue=result.catch(()=>{});return result;};
const memoryStorage=()=>{const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)}};
function browserStorage(){try{if(globalThis.localStorage)return globalThis.localStorage}catch{}return memoryStorage()}
function validState(value){return value?.version===2&&['profiles','slots','appointments','waiting','offers','notifications','rooms','services','professionals','cancellations','audit_log','appointment_events','schedule_exceptions','schedules'].every(k=>Array.isArray(value[k]));}
function filtersFor(filters,now){const from=filters?.from||dayKey(now),to=filters?.to||addDays(from,30);if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||to<from||Date.parse(to)-Date.parse(from)>92*86400000)throw Error('Selecciona un período válido de hasta 93 días.');const offset=Number(filters?.offset||0),limit=Number(filters?.limit||100);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('La paginación solicitada no es válida.');return {...filters,from,to,offset,limit};}

function snapshot(state,actor,input,now){
  const user=actorProfile(state,actor),f=filtersFor(input,now),isStaff=['admin','reception'].includes(user.role),supervisor=user.role==='supervisor';
  const filtered=state.slots.filter(s=>dayKey(s.starts_at)>=f.from&&dayKey(s.starts_at)<=f.to&&(!f.service_id||s.service_id===f.service_id)&&(!f.professional_id||s.professional_id===f.professional_id)&&(!f.room_id||s.room_id===f.room_id)).sort((a,b)=>time(a.starts_at)-time(b.starts_at));
  const visible=filtered.slice(f.offset,f.offset+f.limit),ids=new Set(visible.map(s=>s.id));
  const appScope=supervisor?[]:state.appointments.filter(a=>isStaff?ids.has(a.slot_id):a.patient_id===actor).sort((a,b)=>time(state.slots.find(s=>s.id===a.slot_id)?.starts_at)-time(state.slots.find(s=>s.id===b.slot_id)?.starts_at));
  const appointments=(isStaff?appScope:appScope.slice(f.offset,f.offset+f.limit)).map(a=>({...a,patient_name:fullName(state.profiles.find(p=>p.id===a.patient_id))}));
  const offers=supervisor?[]:state.offers.filter(o=>isStaff?ids.has(o.slot_id):o.patient_id===actor).sort((a,b)=>time(b.created_at)-time(a.created_at)).slice(0,f.limit).map(o=>({...o,patient_name:fullName(state.profiles.find(p=>p.id===o.patient_id))}));
  const waiting=supervisor?[]:state.waiting.filter(w=>isStaff?(!f.service_id||w.service_id===f.service_id):w.patient_id===actor).sort((a,b)=>time(a.created_at)-time(b.created_at)).slice(0,f.limit).map(w=>({...w,patient_name:fullName(state.profiles.find(p=>p.id===w.patient_id))}));
  // Historical and outstanding own records keep their referenced slot available to the UI.
  const related=new Set([...ids,...appointments.map(a=>a.slot_id),...offers.map(o=>o.slot_id)]);
  const cancellations=supervisor?[]:state.cancellations.filter(c=>isStaff?ids.has(c.slot_id):c.patient_id===actor).slice(-f.limit).reverse().map(c=>({...c,patient_name:fullName(state.profiles.find(p=>p.id===c.patient_id))}));
  const profileIds=new Set([actor,...appointments.map(a=>a.patient_id),...waiting.map(w=>w.patient_id),...offers.map(o=>o.patient_id)]);
  const profiles=supervisor?[]:state.profiles.filter(p=>isStaff?(user.role==='admin'||profileIds.has(p.id)):p.id===actor).slice(0,f.limit).map(({id,full_name,last_name,role})=>({id,full_name,last_name,role}));
  const audit=state.audit_log.slice(-f.limit).reverse();
  return clone({
    user:{...user},center:state.center,settings:state.settings,profiles,
    rooms:supervisor?[]:state.rooms,services:state.services,professionals:supervisor?[]:state.professionals,
    slots:supervisor?[]:state.slots.filter(s=>related.has(s.id)).map(s=>({...s,blocked:!slotEnabled(state,s)})),
    available:supervisor?[]:visible.filter(s=>isAvailable(state,s,now)),appointments,waiting,offers,
    notifications:state.notifications.filter(n=>n.patient_id===actor).sort((a,b)=>time(b.created_at)-time(a.created_at)).slice(0,f.limit),
    appointment_events:supervisor?[]:state.appointment_events.filter(e=>isStaff?ids.has(e.slot_id):e.patient_id===actor).slice(-f.limit).reverse(),
    audit_log:supervisor?audit.map(({id,event,created_at})=>({id,event,created_at,detail:'Movimiento administrativo agregado'})):isStaff?audit:[],
    cancellations,schedules:isStaff?state.schedules:[],schedule_exceptions:isStaff?state.schedule_exceptions:[],
    report:['admin','reception','supervisor'].includes(user.role)?report(state,f,now):null,
    pagination:{offset:f.offset,limit:f.limit,total:filtered.length,has_more:filtered.length>f.offset+f.limit},
    demonstration:true,simulated_now:iso(now),revision:state.revision,
    dataset_tag:state.dataset_tag||null,rewards:myRewards(state,actor),
    people_rewards:user.role==='admin'?peopleRewards(state,actor,{p_query:f.people_query||'',p_level:f.people_level||'',p_order:f.people_order||'crowns_desc',p_offset:f.people_offset||0,p_limit:25}):null,
    community:community(state,actor),box_calls:boxCalls(state,actor,{p_pending_only:true},now),
  });
}

export function createDemoService({storage=browserStorage(),now=()=>new Date(),dataset=null}={}){
  if(dataset&&(!validState(dataset)||dataset.dataset_tag!=='medicita-december-2026-v1'||dataset.is_demo!==true||!dataset.profiles.every(p=>p.is_demo===true&&String(p.email||'').endsWith('@example.invalid'))))throw Error('El conjunto de demostración no es válido o contiene identidades ajenas a la simulación.');
  const storageKey=dataset?`${DEMO_KEY}:${dataset.dataset_tag}`:DEMO_KEY;
  const makeSeed=at=>{const value=dataset?clone(dataset):seed(at);value.clock_offset_ms=0;if(dataset)for(const o of value.offers.filter(o=>o.status==='pending')){o.created_at=iso(at);o.expires_at=iso(Math.min(time(at)+value.settings.offer_minutes*60000,time(value.slots.find(s=>s.id===o.slot_id).starts_at)));}initializeRewards(value,at);initializeCommunications(value);value.feature_version=1;return value;};
  const listeners=new Set();let actor='patient-a',destroyed=false;
  const baseNow=()=>{const value=typeof now==='function'?now():now;const result=new Date(value);if(!Number.isFinite(result.getTime()))throw Error('La fecha de la demostración no es válida.');return result;};
  const read=()=>{let value;try{value=JSON.parse(storage.getItem(storageKey))}catch{}if(!validState(value)||(dataset&&value.dataset_tag!==dataset.dataset_tag)){value=makeSeed(baseNow());storage.setItem(storageKey,JSON.stringify(value));}else if(value.feature_version!==1){initializeRewards(value,new Date(time(baseNow())+Number(value.clock_offset_ms||0)));initializeCommunications(value);value.feature_version=1;storage.setItem(storageKey,JSON.stringify(value));}return value;};
  const clock=state=>new Date(baseNow().getTime()+Number(state.clock_offset_ms||0));
  const actorIds=()=>read().profiles.map(p=>p.id);
  try{const saved=storage.getItem(`${storageKey}:actor`);if(actorIds().includes(saved))actor=saved}catch{}
  let channel;try{if(globalThis.window&&typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel(`${storageKey}:updates`);channel.onmessage=()=>emit();}}catch{}
  function emit(){if(!destroyed)for(const listener of listeners){try{listener()}catch{}}}
  function write(state){state.revision=Number(state.revision||0)+1;try{storage.setItem(storageKey,JSON.stringify(state))}catch{throw Error('No pudimos guardar la demostración en este navegador. Revisa el espacio y la privacidad del almacenamiento.');}emit();try{channel?.postMessage({revision:state.revision})}catch{}}
  const storageEvent=event=>{if(event.key===storageKey)emit()};
  globalThis.window?.addEventListener('storage',storageEvent);
  async function locked(task){return serialize(()=>globalThis.window&&globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(`${storageKey}:lock`,async()=>task()):task());}
  async function transaction(name,args={}){
    const requestActor=actor;
    return locked(()=>{
      const state=clone(read()),currentNow=clock(state);
      initializeRewards(state,currentNow);initializeCommunications(state);
      const maintained=maintenance(state,currentNow);
      if(name==='get_snapshot'){if(maintained)write(state);return snapshot(state,requestActor,args.p_filters||{},currentNow)}
      const result=REWARD_RPCS.has(name)?executeRewards(state,requestActor,name,args,currentNow):COMMUNICATION_RPCS.has(name)?executeCommunications(state,requestActor,name,args,currentNow):execute(state,requestActor,name,args,currentNow);
      closeFinishedCalls(state,requestActor,currentNow);
      syncRewards(state,currentNow);
      if(!['compatible_candidates','get_report','get_my_rewards','get_reward_history','get_people_rewards','get_reward_community','get_room_comments','get_comment_moderation','get_box_calls','get_public_box_calls'].includes(name)||maintained)write(state);
      return clone(result);
    });
  }
  return {
    kind:'demo',
    load:(filters={})=>transaction('get_snapshot',{p_filters:filters}),
    rpc:(name,args={})=>transaction(name,args),
    setActor(next){if(!actorIds().includes(next))throw Error('Elige un personaje disponible de la demostración.');actor=next;try{storage.setItem(`${storageKey}:actor`,actor)}catch{}emit();return actor;},
    getActor:()=>actor,
    getActors:()=>read().profiles.map(p=>({id:p.id,label:fullName(p),role:p.role})),
    getBoxCalls:()=>transaction('get_box_calls',{p_pending_only:true}),
    reset:()=>locked(()=>{const state=makeSeed(baseNow());actor='patient-a';try{storage.setItem(`${storageKey}:actor`,actor)}catch{}write(state);return snapshot(state,actor,{},clock(state));}),
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener)},
    getClock:()=>iso(clock(read())),
    advanceTo:value=>locked(()=>{const state=clone(read()),target=time(value);if(!Number.isFinite(target)||target<time(clock(state)))throw Error('El reloj de demostración solo puede avanzar. Reinicia para volver al comienzo.');state.clock_offset_ms=target-baseNow().getTime();maintenance(state,clock(state));write(state);return iso(clock(state));}),
    destroy(){destroyed=true;listeners.clear();globalThis.window?.removeEventListener('storage',storageEvent);try{channel?.close()}catch{}},
  };
}

export default createDemoService;
