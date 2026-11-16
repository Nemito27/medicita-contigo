import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import {config,A11Y_STORAGE_KEY,AUTH_STORAGE_KEY} from './config/app.js';
import {supabase,createLiveService,googleLogin,emailLogin} from './services/api.js';
import {createSessionGate} from './services/session.js';
import {landing,shell,navigation} from './layouts/app.js';
import {renderPatient,handlePatientAction,handlePatientSubmit} from './pages/patient.js';
import {renderAdmin,handleAdminAction,handleAdminSubmit,stopAdminScanner} from './pages/admin.js';
import {esc,btn,dayKey,addDays,dateLabel,chileInput,chileToIso} from './components/ui.js';
import {errorMessage,formValues} from './utils/domain.js';

const app=document.querySelector('#app');
const modal=document.querySelector('#modal');
const toast=document.querySelector('#toast');
const gate=createSessionGate();
const state={data:null,service:null,demo:false,page:'home',loading:false,busy:false,error:'',lastUpdated:'',filters:defaultFilters(),prefs:readPreferences()};
let requestNumber=0,toastTimer,modalTrigger,demoUnsubscribe,signingOut=false;

function defaultFilters(date=dayKey(new Date())){return {from:date,to:addDays(date,30),service_id:'',professional_id:'',room_id:'',offset:0,limit:100};}
function readPreferences(){try{const value=JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY)||'{}');return {simple_mode:Boolean(value.simple_mode),high_contrast:Boolean(value.high_contrast),reduce_motion:Boolean(value.reduce_motion)};}catch{return {};}}
function applyPreferences(){for(const key of ['simple_mode','high_contrast','reduce_motion'])document.documentElement.classList.toggle(key.replaceAll('_','-'),Boolean(state.prefs[key]));}
function notify(message){clearTimeout(toastTimer);toast.textContent=message;toastTimer=setTimeout(()=>toast.textContent='',6500);}
function close(){stopAdminScanner();if(modal.open)modal.close();modal.innerHTML='';}
function show(title,body){
  stopAdminScanner();
  modalTrigger=document.activeElement;
  modal.innerHTML=`<div class="dialog-header"><h2 id="modal-title">${esc(title)}</h2>${btn('×','close','','ghost','aria-label="Cerrar diálogo"')}</div><div class="dialog-body">${body}</div><p id="dialog-error" class="error dialog-error" role="alert" hidden></p>`;
  if(!modal.open)modal.showModal();
}
modal.addEventListener('close',()=>{if(!modal.open){modal.innerHTML='';if(modalTrigger?.isConnected)modalTrigger.focus();}});
function showError(error){
  const message=errorMessage(error);
  if(modal.open){const target=modal.querySelector('#dialog-error');if(target){target.hidden=false;target.textContent=message;target.tabIndex=-1;target.focus();return;}}
  notify(message);
}
function clearPrivate(){
  requestNumber++;state.data=null;state.error='';state.lastUpdated='';state.loading=false;state.page='home';state.filters=defaultFilters();
  close();clearTimeout(toastTimer);toast.textContent='';
}
function context(){return {
  data:state.data,filters:state.filters,demo:state.demo,role:state.data?.user?.role,
  service:state.service,show,close,notify,refresh,mutate,navigate,
  now:()=>new Date(state.demo&&state.service?.getClock?state.service.getClock():Date.now()),
  sessionVersion:()=>gate.version,
};}
function normalized(data){
  const arrays=['profiles','rooms','services','professionals','slots','available','appointments','waiting','offers','notifications','appointment_events','audit_log','cancellations','schedule_exceptions','schedules'];
  for(const name of arrays)if(!Array.isArray(data[name]))data[name]=[];
  data.user.preferences ||= {};
  return data;
}
function render(){
  applyPreferences();
  if(!state.data){
    app.innerHTML=landing({error:state.error,prefs:state.prefs});
    if(state.loading)app.querySelector('.login-panel')?.insertAdjacentHTML('afterbegin','<div class="loading-state" role="status">Verificando tu cuenta y preparando tus datos…</div>');
    return;
  }
  const allowed=navigation(state.data.user.role).map(item=>item[0]);
  if(!allowed.includes(state.page))state.page=allowed[0];
  let content;
  try{content=['patient'].includes(state.data.user.role)||['help','profile','notifications'].includes(state.page)?renderPatient(state.page,context()):renderAdmin(state.page,context());}
  catch(error){console.error('No se pudo mostrar la vista',error);content=`<section class="card"><h1>No pudimos mostrar esta sección.</h1><p>Actualiza la información para volver a intentarlo.</p>${btn('Actualizar','refresh','','primary')}</section>`;}
  app.innerHTML=shell({...state,content:`<div class="page-content stack">${content}</div>`,offline:!navigator.onLine,demoClock:state.demo&&state.service.getClock?dateLabel(state.service.getClock()):''});
  if(state.demo){const actor=document.querySelector('#demo-actor');if(actor)actor.value=state.service.getActor();}
}
async function refresh(patch={}){
  if(!state.service)return;
  if(patch&&typeof patch==='object')state.filters={...state.filters,...patch};
  const version=gate.version,request=++requestNumber,service=state.service;
  state.loading=true;
  if(!state.data)render();
  try{
    const next=await service.load({...state.filters});
    if(!gate.isCurrent(version)||request!==requestNumber||service!==state.service)return;
    state.data=normalized(next);state.error='';state.loading=false;
    state.lastUpdated=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).format(new Date());
    state.prefs={...state.prefs,...state.data.user.preferences};
    if(state.data.user.onboarded===false&&!state.demo)state.page='profile';
    render();
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
  close();state.page=page;render();
  document.querySelector('#main-content')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
}
function updateAddress(demo){
  const url=new URL(location.href);url.searchParams.delete('code');url.searchParams.delete('error');url.searchParams.delete('error_description');
  if(demo)url.searchParams.set('demo','1');else url.searchParams.delete('demo');
  history.replaceState(null,'',url);
}
async function startDemo(){
  const {createDemoService}=await import('./services/demo.js');
  demoUnsubscribe?.();state.demo=true;state.service=createDemoService({storage:localStorage});
  gate.apply(`demo:${state.service.getActor()}`);clearPrivate();updateAddress(true);
  demoUnsubscribe=state.service.subscribe?.(()=>{if(state.demo&&!state.busy&&!modal.open)refresh();});
  await refresh();
}
function transitionAuth(session){
  if(state.demo||signingOut)return false;
  const changed=gate.apply(session?.user?.id||null);
  if(changed){clearPrivate();state.service=session?createLiveService():null;render();}
  if(session&&!state.service)state.service=createLiveService();
  return changed;
}
async function applyAuth(session){
  if(state.demo||signingOut)return;
  const changed=transitionAuth(session);
  if(session&&(!state.data||changed))await refresh();
}
async function logout(){
  if(state.demo){demoUnsubscribe?.();demoUnsubscribe=null;state.demo=false;state.service=null;gate.apply(null);clearPrivate();updateAddress(false);render();return;}
  signingOut=true;gate.apply(null);clearPrivate();state.service=null;render();
  try{
    const {error}=await supabase.auth.signOut({scope:'local'});
    if(error){supabase.auth.stopAutoRefresh();localStorage.removeItem(AUTH_STORAGE_KEY);notify('La cuenta se cerró en este navegador.');location.reload();}
  }finally{signingOut=false;}
}
async function toggleAccessibility(key){
  state.prefs[key]=!state.prefs[key];localStorage.setItem(A11Y_STORAGE_KEY,JSON.stringify(state.prefs));applyPreferences();render();
  if(state.data){
    try{await state.service.rpc('save_profile',{p_name:state.data.user.full_name,p_last_name:state.data.user.last_name||'',p_phone:state.data.user.phone||'',p_preferences:{...state.data.user.preferences,...state.prefs}});state.data.user.preferences={...state.data.user.preferences,...state.prefs};}
    catch{notify('La preferencia se aplicó en este dispositivo. No pudimos guardarla en tu cuenta.');}
  }
}
async function action(name,id){
  if(name==='close'){close();return;}
  if(name==='logout'){await logout();return;}
  if(name==='access-simple'){await toggleAccessibility('simple_mode');return;}
  if(name==='access-contrast'){await toggleAccessibility('high_contrast');return;}
  if(name==='login-google'){try{await googleLogin();}catch(error){state.error=errorMessage(error);render();document.querySelector('#login')?.scrollIntoView();}return;}
  if(name==='start-demo'){await startDemo();return;}
  if(name==='brand-home'){if(state.data)navigate(navigation(state.data.user.role)[0][0]);else window.scrollTo({top:0});return;}
  if(name==='public-help'){show('Centro de ayuda',renderPatient('help',{...context(),data:state.data||{user:{preferences:{}},center:{},notifications:[]}}));return;}
  if(name==='refresh'){await refresh();return;}
  if(name==='demo-reset'&&state.demo){show('Reiniciar la demostración',`<p>Volverás al escenario ficticio inicial. Solo se borran los cambios de esta demostración en este navegador.</p><div class="actions">${btn('Volver','close','','secondary')}${btn('Reiniciar escenario','demo-reset-confirm','','primary')}</div>`);return;}
  if(name==='demo-reset-confirm'&&state.demo){await state.service.reset();gate.invalidate();clearPrivate();close();await refresh();notify('Escenario ficticio reiniciado.');return;}
  if(name==='demo-clock'&&state.demo){const current=state.service.getClock?.()||new Date().toISOString();show('Reloj de la demostración',`<p>Esta fecha es simulada y solo afecta los datos ficticios. Permite mostrar llegada y atención sin cambiar las reglas del sistema real.</p><form id="demo-clock-form"><div class="field"><label for="demo-time">Fecha y hora simulada de Chile</label><input id="demo-time" type="datetime-local" name="time" required value="${esc(chileInput(current))}"></div><div class="actions">${btn('Volver','close','','secondary')}<button type="submit" class="btn btn-primary">Aplicar fecha simulada</button></div></form>`);return;}
  if(!state.data)return;
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
    if(await handlePatientSubmit(context(),formId,values,form))return;
    await handleAdminSubmit(context(),formId,values,form);
  }catch(error){showError(error);}
});
document.addEventListener('input',event=>{const form=event.target.closest('form');if(form)form.dataset.dirty='true';});
document.addEventListener('change',async event=>{
  if(event.target.id!=='demo-actor'||!state.demo||state.busy)return;
  try{const actor=event.target.value;await state.service.setActor(actor);gate.apply(`demo:${actor}`);clearPrivate();await refresh();}catch(error){showError(error);}
});
window.addEventListener('online',()=>{if(state.service)refresh();else render();});
window.addEventListener('offline',()=>{if(!modal.open)render();notify('Sin conexión. Los cambios reales requieren conectarte.');});
// This polling only refreshes visible information. Maintenance/reminders belong
// to the separate scheduled backend job and never depend on this browser.
setInterval(()=>{if(state.data&&!state.busy&&!modal.open&&document.visibilityState==='visible'&&!document.activeElement?.closest('form')&&!document.querySelector('form[data-dirty="true"]'))refresh();},30000);
if(supabase)supabase.auth.onAuthStateChange((_event,session)=>{
  if(state.demo||signingOut)return;
  const changed=transitionAuth(session),version=gate.version;
  // Invalidate private UI synchronously; defer only Supabase requests until its
  // authentication callback releases the session lock.
  if(session&&(changed||!state.data))setTimeout(()=>{if(gate.isCurrent(version))refresh().catch(showError);},0);
});
async function boot(){
  render();
  if(new URL(location.href).searchParams.get('demo')==='1'){await startDemo();return;}
  const version=gate.version;
  if(supabase){const {data:{session},error}=await supabase.auth.getSession();if(!gate.isCurrent(version))return;if(error)throw error;await applyAuth(session);}
}
boot().catch(error=>{state.error=errorMessage(error);render();});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('./sw.js',new URL('.',location.href)),{scope:'./'}).catch(()=>{}));}
