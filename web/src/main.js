import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/rewards.css';
import './styles/communication.css';
import './styles/update.css';
import {config,A11Y_STORAGE_KEY,AUTH_STORAGE_KEY} from './config/app.js';
import {supabase,createLiveService,googleLogin,emailLogin,getPublicBoxCalls,fetchDemonstrationDataset} from './services/api.js';
import {ACCESSIBILITY_KEYS,readAccessibility,mergeAccessibility,persistAccessibility} from './services/accessibility.js';
import {createSessionGate} from './services/session.js';
import {landing,shell,navigation} from './layouts/app.js';
import {renderPatient,handlePatientAction,handlePatientSubmit} from './pages/patient.js';
import {renderAdmin,handleAdminAction,handleAdminSubmit,stopAdminScanner} from './pages/admin.js';
import {renderRewards,handleRewardAction,handleRewardSubmit} from './pages/rewards.js';
import {renderCommunication,renderCallAlerts,renderPublicRoom,handleCommunicationAction,handleCommunicationSubmit,clearCommunicationState} from './pages/communication.js';
import {esc,btn,dayKey,addDays,dateLabel,chileInput,chileToIso} from './components/ui.js';
import {errorMessage,formValues} from './utils/domain.js';

const app=document.querySelector('#app');
const modal=document.querySelector('#modal');
const toast=document.querySelector('#toast');
const gate=createSessionGate();
const localAccessibility=readAccessibility(localStorage,A11Y_STORAGE_KEY);
const state={data:null,service:null,demo:false,page:'home',loading:false,busy:false,error:'',lastUpdated:'',filters:defaultFilters(),prefs:localAccessibility.prefs,pendingPrefs:localAccessibility.pending,calls:[],visualNotice:'',visualNoticeType:'info',dataset:false,publicRoom:null,publicCalls:[]};
let requestNumber=0,toastTimer,modalTrigger,demoUnsubscribe,signingOut=false,callUnsubscribe,callService,callLoading=false,publicTimer;
const receivedCalls=new Set(),vibratedCalls=new Set();
const alertMarkup=new WeakMap();

function defaultFilters(date=dayKey(new Date())){return {from:date,to:addDays(date,30),service_id:'',professional_id:'',room_id:'',offset:0,limit:100};}
function applyPreferences(){for(const key of ACCESSIBILITY_KEYS)document.documentElement.classList.toggle(key.replaceAll('_','-'),Boolean(state.prefs[key]));}
function notify(message,kind='info'){clearTimeout(toastTimer);toast.textContent=message;if(state.prefs.visual_mode){state.visualNotice=message;state.visualNoticeType=kind;paintVisualAlerts();}toastTimer=setTimeout(()=>toast.textContent='',6500);}
function close(){stopAdminScanner();if(modal.open)modal.close();modal.innerHTML='';paintVisualAlerts();}
function show(title,body){
  stopAdminScanner();
  modalTrigger=document.activeElement;
  modal.innerHTML=`<div class="dialog-header"><h2 id="modal-title">${esc(title)}</h2>${btn('×','close','','ghost','aria-label="Cerrar diálogo"')}</div><div id="dialog-visual-alerts"></div><div class="dialog-body">${body}</div><p id="dialog-error" class="error dialog-error" role="alert" hidden></p>`;
  if(!modal.open)modal.showModal();
  paintVisualAlerts();
}
modal.addEventListener('close',()=>{if(!modal.open){modal.innerHTML='';paintVisualAlerts();if(modalTrigger?.isConnected)modalTrigger.focus();}});
function showError(error){
  const message=errorMessage(error);
  if(modal.open){const target=modal.querySelector('#dialog-error');if(target){target.hidden=false;target.textContent=message;target.tabIndex=-1;target.focus();return;}}
  notify(message,'error');
}
function clearPrivate(){
  callUnsubscribe?.();callUnsubscribe=null;callService=null;callLoading=false;receivedCalls.clear();vibratedCalls.clear();clearCommunicationState();state.calls=[];state.visualNotice='';
  requestNumber++;state.data=null;state.error='';state.lastUpdated='';state.loading=false;state.page='home';state.filters=defaultFilters();
  close();clearTimeout(toastTimer);toast.textContent='';
}
function context(){return {
  data:state.data,filters:state.filters,demo:state.demo,role:state.data?.user?.role,
  service:state.service,show,close,notify,refresh,mutate,navigate,
  currentCalls:state.calls,visualPreferences:state.prefs,respondCall,refreshCalls,publicRoom:state.publicRoom,publicCalls:state.publicCalls,refreshPublicCalls,
  now:()=>new Date(state.demo&&state.service?.getClock?state.service.getClock():Date.now()),
  sessionVersion:()=>gate.version,
};}
function normalized(data){
  const arrays=['profiles','rooms','services','professionals','slots','available','appointments','waiting','offers','notifications','appointment_events','audit_log','cancellations','schedule_exceptions','schedules'];
  for(const name of arrays)if(!Array.isArray(data[name]))data[name]=[];
  data.user.preferences ||= {};
  return data;
}
function paintVisualAlerts(){
  const main=document.querySelector('#visual-alerts'),dialog=modal.querySelector('#dialog-visual-alerts');
  const message=state.visualNotice?`<div class="visual-operation ${state.visualNoticeType==='error'?'error':'notice'}" role="${state.visualNoticeType==='error'?'alert':'status'}"><span aria-hidden="true">${state.visualNoticeType==='error'?'!':'ⓘ'}</span><p><strong>${state.visualNoticeType==='error'?'No se pudo completar':'Aviso'}</strong><br>${esc(state.visualNotice)}</p>${btn('Cerrar aviso','visual-dismiss','','ghost')}</div>`:'';
  const html=message+(state.data?renderCallAlerts(context(),state.calls):'');
  for(const [target,value] of [[main,modal.open?'':html],[dialog,modal.open?html:'']])if(target&&alertMarkup.get(target)!==value){target.innerHTML=value;alertMarkup.set(target,value);}
}
function hasOpenDraft(){return modal.open||Boolean(document.activeElement?.closest('form'))||Boolean(document.querySelector('form[data-dirty="true"]'));}
function paintConnectivity(){
  const target=document.querySelector('#connectivity-status');
  if(target)target.innerHTML=!navigator.onLine&&!state.demo?'<div class="error connectivity-banner" role="alert">Sin conexión. La información puede estar desactualizada. No se pueden confirmar operaciones hasta reconectarse.</div>':'';
}
function watchCalls(){
  if(!state.service?.getBoxCalls||state.data?.user.role==='supervisor'||callService===state.service)return;
  callUnsubscribe?.();callService=state.service;
  callUnsubscribe=state.service.subscribeCalls?.(state.data.user,()=>refreshCalls().catch(()=>{}));
}
async function refreshCalls(){
  if(!state.data||!state.service?.getBoxCalls||state.data.user.role==='supervisor'||callLoading)return;
  const version=gate.version,service=state.service;callLoading=true;
  try{
    const calls=await service.getBoxCalls();
    if(!gate.isCurrent(version)||service!==state.service)return;
    state.calls=Array.isArray(calls)?calls:[];state.data.box_calls=state.calls;paintVisualAlerts();
    if(state.data.user.role==='patient')for(const call of state.calls){
      if(!gate.isCurrent(version)||service!==state.service)return;
      if(!vibratedCalls.has(call.id)){
        vibratedCalls.add(call.id);
        if(state.prefs.vibration_enabled&&typeof navigator.vibrate==='function'&&['pending','received'].includes(call.status))try{navigator.vibrate([180,100,180]);}catch{}
      }
      if(call.status==='pending'&&!receivedCalls.has(call.id)){
        receivedCalls.add(call.id);
        try{await service.rpc('respond_box_call',{p_id:call.id,p_response:'received'});if(gate.isCurrent(version)&&service===state.service){if(call.status==='pending')call.status='received';paintVisualAlerts();}}catch{if(gate.isCurrent(version)&&service===state.service)receivedCalls.delete(call.id);}
      }
    }
    if(state.page==='calls'&&!modal.open&&!document.querySelector('form[data-dirty="true"]')&&!document.activeElement?.closest('form'))render();
  }finally{if(gate.isCurrent(version)&&service===state.service)callLoading=false;}
}
async function respondCall(id,response){
  if(!state.data||!state.service||!['understood','help'].includes(response))return;
  const version=gate.version,service=state.service;
  await service.rpc('respond_box_call',{p_id:id,p_response:response});
  if(!gate.isCurrent(version)||service!==state.service)return;
  const call=state.calls.find(item=>item.id===id);if(call)call.status=response;
  paintVisualAlerts();notify(response==='help'?'Tu solicitud de ayuda quedó enviada al equipo.':'Confirmaste que entendiste el llamado.');
  await refreshCalls();
}
async function refreshPublicCalls(){
  if(state.publicRoom===null)return;
  try{const room=state.publicRoom==='todas'?null:state.publicRoom;state.publicCalls=state.demo?await state.service.rpc('get_public_box_calls',{p_room:room}):await getPublicBoxCalls(room);state.error='';}catch(error){state.error=errorMessage(error);}
  render();
}
function render(){
  applyPreferences();
  if(state.publicRoom!==null){app.innerHTML=`${state.error?`<p class="error" role="alert">${esc(state.error)}</p>`:''}${renderPublicRoom(context())}`;return;}
  if(!state.data){
    app.innerHTML=`<div id="visual-alerts"></div>${landing({error:state.error,prefs:state.prefs})}`;
    paintVisualAlerts();
    if(state.loading)app.querySelector('.login-panel')?.insertAdjacentHTML('afterbegin','<div class="loading-state" role="status">Verificando tu cuenta y preparando tus datos…</div>');
    return;
  }
  const allowed=navigation(state.data.user.role).map(item=>item[0]);
  if(!allowed.includes(state.page))state.page=allowed[0];
  let content;
  try{
    if(state.loading&&['community','patients','moderation'].includes(state.page))content='<section class="card loading-state" role="status">Cargando información de esta sección…</section>';
    else if(['rewards','community','patients','people-rewards'].includes(state.page))content=renderRewards(state.page,context());
    else if(['calls','moderation','public-room'].includes(state.page))content=renderCommunication(state.page,context());
    else content=['patient'].includes(state.data.user.role)||['help','profile','notifications'].includes(state.page)?renderPatient(state.page,context()):renderAdmin(state.page,context());
    if(state.page==='resources'&&state.data.user.role==='admin'&&!state.demo)content+=`<section class="card stack"><h2>Conjunto ficticio de diciembre</h2><p>La plantilla <code>medicita-december-2026-v1</code> está aislada de las personas, reservas y agendas reales. Regenerar restaura su plantilla; retirar desactiva su apertura desde el servidor. Las copias ya guardadas en otros navegadores se conservan hasta reiniciarlas.</p><div class="actions">${btn('Regenerar plantilla ficticia','dataset-manage','reset','secondary')}${btn('Retirar plantilla ficticia','dataset-manage','retire','danger')}</div></section>`;
  }
  catch(error){console.error('No se pudo mostrar la vista',error);content=`<section class="card"><h1>No pudimos mostrar esta sección.</h1><p>Actualiza la información para volver a intentarlo.</p>${btn('Actualizar','refresh','','primary')}</section>`;}
  app.innerHTML=shell({...state,demoActors:state.demo?state.service.getActors?.():null,content:`<div id="visual-alerts"></div><div class="page-content stack">${content}</div>`,offline:!navigator.onLine,demoClock:state.demo&&state.service.getClock?dateLabel(state.service.getClock()):''});
  paintVisualAlerts();
  if(state.demo){const actor=document.querySelector('#demo-actor');if(actor)actor.value=state.service.getActor();}
}
async function refresh(patch={}){
  if(!state.service)return;
  if(patch&&typeof patch==='object')state.filters={...state.filters,...patch};
  const version=gate.version,request=++requestNumber,service=state.service;
  state.loading=true;
  if(!state.data)render();
  try{
    const next=await service.load({...state.filters,view:state.page});
    if(!gate.isCurrent(version)||request!==requestNumber||service!==state.service)return;
    state.data=normalized(next);state.error='';state.loading=false;
    state.lastUpdated=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).format(new Date());
    state.prefs=mergeAccessibility(state.prefs,state.demo?[]:state.pendingPrefs,state.data.user.preferences);
    if(!state.demo&&state.pendingPrefs.length){
      const pending=[...state.pendingPrefs],preferences=Object.fromEntries(pending.map(key=>[key,state.prefs[key]]));
      try{await service.rpc('save_accessibility_preferences',{p_preferences:preferences});if(!gate.isCurrent(version)||request!==requestNumber||service!==state.service)return;state.pendingPrefs=state.pendingPrefs.filter(key=>!pending.includes(key));state.data.user.preferences={...state.data.user.preferences,...preferences};}
      catch{if(!gate.isCurrent(version)||request!==requestNumber||service!==state.service)return;state.visualNotice='Tus preferencias se aplicaron aquí. Reintentaremos guardarlas en tu cuenta al actualizar.';}
    }
    if(!gate.isCurrent(version)||request!==requestNumber||service!==state.service)return;
    if(!state.demo)persistAccessibility(localStorage,A11Y_STORAGE_KEY,state.prefs,state.pendingPrefs);
    state.calls=Array.isArray(next.box_calls)?next.box_calls:[];
    if(state.data.user.onboarded===false&&!state.demo)state.page='profile';
    render();watchCalls();refreshCalls().catch(()=>{});
  }catch(error){
    if(!gate.isCurrent(version)||request!==requestNumber)return;
    state.loading=false;
    if(error.code==='SESSION_REQUIRED'){gate.apply(null);clearPrivate();state.service=null;}
    state.error=errorMessage(error);render();
  }
}
async function mutate(name,args,message,options={}){
  if(state.busy)throw Error('Estamos guardando tu operación. Espera un momento.');
  if(!state.demo&&!navigator.onLine)throw Error('Sin conexión. No hemos confirmado ningún cambio.');
  const version=gate.version;
  state.busy=true;document.documentElement.dataset.saving='true';
  document.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
    const result=await state.service.rpc(name,args);
    if(!gate.isCurrent(version))return;
    if(!options.keepOpen)close();
    await refresh();
    if(gate.isCurrent(version)&&message)notify(message);
    return result;
  }finally{
    state.busy=false;delete document.documentElement.dataset.saving;
    document.querySelectorAll('button').forEach(button=>button.disabled=false);
  }
}
function navigate(page){
  if(!state.data)return;
  const allowed=navigation(state.data.user.role).map(item=>item[0]);
  if(!allowed.includes(page))return;
  close();state.page=page;if(['community','patients','moderation'].includes(page))state.loading=true;render();
  if(['community','patients','moderation'].includes(page))refresh();
  document.querySelector('#main-content')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
}
function updateAddress(demo,day=''){
  const url=new URL(location.href);url.searchParams.delete('code');url.searchParams.delete('error');url.searchParams.delete('error_description');
  if(demo)url.searchParams.set('demo','1');else url.searchParams.delete('demo');
  if(demo&&state.dataset){url.searchParams.set('dataset','december-2026');if(day)url.searchParams.set('day',day);}else{url.searchParams.delete('dataset');url.searchParams.delete('day');}
  history.replaceState(null,'',url);
}
async function startDemo(options={}){
  const {createDemoService}=await import('./services/demo.js');
  const dataset=options.dataset?await fetchDemonstrationDataset():null;
  demoUnsubscribe?.();if(state.demo)state.service?.destroy?.();state.demo=true;state.dataset=Boolean(dataset);state.service=createDemoService({storage:localStorage,dataset});
  if(!gate.apply(`demo:${state.service.getActor()}`))gate.invalidate();clearPrivate();
  if(dataset){const day=['2026-12-03','2026-12-04','2026-12-05'].includes(options.day)?options.day:'2026-12-03',role=state.service.getActors?.().find(person=>person.id===state.service.getActor())?.role;state.filters={...defaultFilters(day),to:day};state.page=role==='patient'?'appointments':role==='supervisor'?'reports':'calendar';updateAddress(true,day);}else updateAddress(true);
  demoUnsubscribe=state.service.subscribe?.(()=>{if(state.demo&&!state.busy){refreshCalls().catch(()=>{});if(!modal.open&&!document.querySelector('form[data-dirty="true"]')&&!document.activeElement?.closest('form'))refresh();}});
  await refresh();
}
function transitionAuth(session){
  if(state.demo||signingOut||state.publicRoom!==null)return false;
  const changed=gate.apply(session?.user?.id||null);
  if(changed){clearPrivate();state.service=session?createLiveService():null;render();}
  if(session&&!state.service)state.service=createLiveService();
  return changed;
}
async function applyAuth(session){
  if(state.demo||signingOut||state.publicRoom!==null)return;
  const changed=transitionAuth(session);
  if(session&&(!state.data||changed))await refresh();
}
async function logout(){
  if(state.demo){demoUnsubscribe?.();demoUnsubscribe=null;state.service?.destroy?.();state.demo=false;state.dataset=false;state.service=null;gate.apply(null);clearPrivate();updateAddress(false);render();return;}
  signingOut=true;gate.apply(null);clearPrivate();state.service=null;render();
  try{
    const {error}=await supabase.auth.signOut({scope:'local'});
    if(error){supabase.auth.stopAutoRefresh();localStorage.removeItem(AUTH_STORAGE_KEY);notify('La cuenta se cerró en este navegador.');location.reload();}
  }finally{signingOut=false;}
}
async function toggleAccessibility(key){
  state.prefs[key]=!state.prefs[key];
  if(!state.data&&!state.pendingPrefs.includes(key))state.pendingPrefs.push(key);
  persistAccessibility(localStorage,A11Y_STORAGE_KEY,state.prefs,state.pendingPrefs);applyPreferences();render();
  if(state.data){
    const version=gate.version,service=state.service,value=state.prefs[key];
    try{await service.rpc('save_accessibility_preferences',{p_preferences:{[key]:value}});if(gate.isCurrent(version)&&service===state.service)state.data.user.preferences={...state.data.user.preferences,[key]:value};}
    catch{if(gate.isCurrent(version)){if(!state.demo&&!state.pendingPrefs.includes(key))state.pendingPrefs.push(key);persistAccessibility(localStorage,A11Y_STORAGE_KEY,state.prefs,state.pendingPrefs);notify('La preferencia se aplicó en este dispositivo. No pudimos guardarla en tu cuenta.');}}
  }
}
async function action(name,id){
  if(name==='close'){close();return;}
  if(name==='logout'){await logout();return;}
  if(name==='access-simple'){await toggleAccessibility('simple_mode');return;}
  if(name==='access-contrast'){await toggleAccessibility('high_contrast');return;}
  if(name==='access-visual'){await toggleAccessibility('visual_mode');return;}
  if(name==='visual-dismiss'){state.visualNotice='';paintVisualAlerts();return;}
  if(name==='comm-public-refresh'&&state.publicRoom!==null){await refreshPublicCalls();return;}
  if(name==='login-google'){try{await googleLogin();}catch(error){state.error=errorMessage(error);render();document.querySelector('#login')?.scrollIntoView();}return;}
  if(name==='start-demo'){await startDemo();return;}
  if(name==='december-day'){
    const day=['2026-12-03','2026-12-04','2026-12-05'].includes(id)?id:'2026-12-03';
    if(!state.demo||!state.dataset)await startDemo({dataset:true,day});
    else{state.page=state.data?.user.role==='patient'?'appointments':state.data?.user.role==='supervisor'?'reports':'calendar';updateAddress(true,day);await refresh({from:day,to:day,offset:0});}
    return;
  }
  if(name==='brand-home'){if(state.data)navigate(navigation(state.data.user.role)[0][0]);else window.scrollTo({top:0});return;}
  if(name==='public-help'){show('Centro de ayuda',renderPatient('help',{...context(),data:state.data||{user:{preferences:{}},center:{},notifications:[]}}));return;}
  if(name==='refresh'){await refresh();return;}
  if(name==='demo-reset'&&state.demo){show('Reiniciar la demostración',`<p>Volverás al escenario ficticio inicial. Solo se borran los cambios de esta demostración en este navegador.</p><div class="actions">${btn('Volver','close','','secondary')}${btn('Reiniciar escenario','demo-reset-confirm','','primary')}</div>`);return;}
  if(name==='demo-reset-confirm'&&state.demo){const day=state.dataset&&['2026-12-03','2026-12-04','2026-12-05'].includes(state.filters.from)?state.filters.from:null;await state.service.reset();gate.invalidate();clearPrivate();if(day){state.filters={...defaultFilters(day),to:day};state.page='appointments';}close();await refresh();notify('Escenario ficticio reiniciado.');return;}
  if(name==='demo-clock'&&state.demo){const current=state.service.getClock?.()||new Date().toISOString();show('Reloj de la demostración',`<p>Esta fecha es simulada y solo afecta los datos ficticios. Permite mostrar llegada y atención sin cambiar las reglas del sistema real.</p><form id="demo-clock-form"><div class="field"><label for="demo-time">Fecha y hora simulada de Chile</label><input id="demo-time" type="datetime-local" name="time" required value="${esc(chileInput(current))}"></div><div class="actions">${btn('Volver','close','','secondary')}<button type="submit" class="btn btn-primary">Aplicar fecha simulada</button></div></form>`);return;}
  if(!state.data)return;
  if(name==='dataset-manage'&&state.data.user.role==='admin'&&!state.demo&&['reset','retire'].includes(id)){show(id==='reset'?'Regenerar datos ficticios':'Retirar datos ficticios',`<p>Esta acción ${id==='reset'?'restaura la plantilla':'desactiva la apertura'} del conjunto <strong>medicita-december-2026-v1</strong>. Solo afecta al registro de demostración del servidor.</p><div class="actions">${btn('Volver','close','','secondary')}${btn(id==='reset'?'Sí, regenerar plantilla':'Sí, retirar plantilla','dataset-manage-confirm',id,id==='reset'?'primary':'danger')}</div>`);return;}
  if(name==='dataset-manage-confirm'&&state.data.user.role==='admin'&&!state.demo&&['reset','retire'].includes(id)){await mutate('manage_demo_dataset',{p_action:id,p_tag:'medicita-december-2026-v1'},id==='reset'?'Plantilla ficticia regenerada.':'Plantilla ficticia retirada del servidor.');return;}
  if(await handleRewardAction(context(),name,id))return;
  if(await handleCommunicationAction(context(),name,id))return;
  if(await handlePatientAction(context(),name,id))return;
  if(await handleAdminAction(context(),name,id))return;
  notify('No pudimos abrir esta acción. Actualiza la sección para reintentar.');
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-page],[data-action]');if(!target)return;
  if(target.tagName==='A')event.preventDefault();
  if(state.busy)return;
  try{if(target.dataset.page)navigate(target.dataset.page);else await action(target.dataset.action,target.dataset.id||'');}catch(error){showError(error);}
});
document.addEventListener('submit',async event=>{
  event.preventDefault();if(state.busy)return;
  // Named form controls (for example name="id") can shadow form.id.
  const form=event.target,formId=form.getAttribute('id')||'',values=formValues(form);
  try{
    if(formId==='login-email'){await emailLogin(values.email);notify('Enlace solicitado. Si el remitente está configurado, revisa tu correo.');return;}
    if(formId==='demo-clock-form'&&state.demo){await state.service.advanceTo(chileToIso(values.time));close();await refresh({from:values.time.slice(0,10),to:addDays(values.time.slice(0,10),30),offset:0});notify('Fecha de la demostración actualizada.');return;}
    if(await handleRewardSubmit(context(),formId,values,form))return;
    if(await handleCommunicationSubmit(context(),formId,values,form))return;
    if(await handlePatientSubmit(context(),formId,values,form))return;
    await handleAdminSubmit(context(),formId,values,form);
  }catch(error){showError(error);}
});
document.addEventListener('input',event=>{const form=event.target.closest('form');if(form)form.dataset.dirty='true';});
document.addEventListener('change',async event=>{
  if(event.target.id!=='demo-actor'||!state.demo||state.busy)return;
  try{const actor=event.target.value,filters=state.filters;await state.service.setActor(actor);gate.apply(`demo:${actor}`);clearPrivate();if(state.dataset)state.filters=filters;await refresh();}catch(error){showError(error);}
});
window.addEventListener('online',()=>{
  if(state.publicRoom!==null){refreshPublicCalls();return;}
  paintConnectivity();refreshCalls().catch(()=>{});
  if(state.service){if(!hasOpenDraft())refresh();}else render();
  notify('Conexión restablecida. Los llamados pendientes se recuperan automáticamente.');
});
window.addEventListener('offline',()=>{
  if(state.publicRoom!==null){state.error='Sin conexión. Los llamados pueden estar desactualizados.';render();return;}
  paintConnectivity();notify('Sin conexión. Los cambios reales requieren conectarte.');
});
// This polling only refreshes visible information. Maintenance/reminders belong
// to the separate scheduled backend job and never depend on this browser.
setInterval(()=>{if(state.data&&!state.busy&&!modal.open&&document.visibilityState==='visible'&&!document.activeElement?.closest('form')&&!document.querySelector('form[data-dirty="true"]'))refresh();},30000);
// Calls are refreshed independently of form drafts and dialogs. Realtime is an
// optional acceleration; this polling also restores pending calls on reconnect.
setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)refreshCalls().catch(()=>{});},10000);
if(supabase)supabase.auth.onAuthStateChange((_event,session)=>{
  if(state.demo||signingOut||state.publicRoom!==null)return;
  const changed=transitionAuth(session),version=gate.version;
  // Invalidate private UI synchronously; defer only Supabase requests until its
  // authentication callback releases the session lock.
  if(session&&(changed||!state.data))setTimeout(()=>{if(gate.isCurrent(version))refresh().catch(showError);},0);
});
async function boot(){
  const params=new URL(location.href).searchParams;
  if(params.has('sala')){
    const room=params.get('sala')||'todas',demo=params.get('demo')==='1';
    const valid=demo?/^[a-z0-9-]{1,80}$/i.test(room):/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room);
    if(room!=='todas'&&!valid)throw Error('El identificador de sala no es válido.');
    state.publicRoom=room;
    if(demo)await startDemo({dataset:params.get('dataset')==='december-2026',day:params.get('day')});
    await refreshPublicCalls();publicTimer=setInterval(refreshPublicCalls,10000);return;
  }
  render();
  if(params.get('demo')==='1'){await startDemo({dataset:params.get('dataset')==='december-2026',day:params.get('day')});return;}
  const version=gate.version;
  if(supabase){const {data:{session},error}=await supabase.auth.getSession();if(!gate.isCurrent(version))return;if(error)throw error;await applyAuth(session);}
}
boot().catch(error=>{state.error=errorMessage(error);render();});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('./sw.js',new URL('.',location.href)),{scope:'./'}).catch(()=>{}));}
