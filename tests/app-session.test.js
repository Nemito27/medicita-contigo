import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSessionGate} from '../web/src/services/session.js';
import {dayKey,addDays} from '../web/src/utils/date.js';
import {esc,btn,brand,icon} from '../web/src/components/ui.js';
import {handlePatientSubmit as actualPatientSubmit} from '../web/src/pages/patient.js';

const source=readFileSync(new URL('../web/src/main.js',import.meta.url),'utf8')
  .replace(/^import .*\n/gm,'')
  .replace(/^boot\(\)\.catch\(error=>\{state\.error=errorMessage\(error\);render\(\);\}\);\n/m,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const snapshot=id=>({user:{id,role:'patient',full_name:id,preferences:{},onboarded:true},appointments:[{id:`private-${id}`}],notifications:[]});

function harness({serviceFor=id=>({load:async()=>snapshot(id),rpc:async()=>null}),getSession=async()=>({data:{session:null},error:null}),signOut=async()=>({error:null}),patientSubmit=async()=>false,adminSubmit=async()=>false,valuesForForm=()=>({})}={}){
  let authCallback,currentUser=null,creations=0,reloads=0;
  const timers=[],events=new Map(),modalEvents=new Map(),storage=new Map();
  const app={innerHTML:'',querySelector:()=>null};
  const modal={open:false,innerHTML:'',addEventListener:(name,callback)=>modalEvents.set(name,callback),close(){this.open=false;},showModal(){this.open=true;},querySelector:()=>null};
  const toast={textContent:''};
  const context=vm.createContext({
    console,Intl,URL,Date,Promise,createSessionGate,dayKey,addDays,esc,btn,
    A11Y_STORAGE_KEY:'medicita-contigo-a11y-v2',AUTH_STORAGE_KEY:'medicita-contigo-auth-v2',
    config:{configured:true},
    document:{
      querySelector:selector=>({'#app':app,'#modal':modal,'#toast':toast}[selector]||null),
      querySelectorAll:()=>[],addEventListener:(name,callback)=>events.set(name,callback),
      documentElement:{dataset:{},classList:{toggle(){}}},activeElement:null,visibilityState:'visible',
    },
    navigator:{onLine:true},window:{addEventListener(){},scrollTo(){}},
    location:{href:'https://example.invalid/medicita-contigo/',reload(){reloads++;}},
    history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setInterval(){},setTimeout(callback,delay=0){const entry={callback,delay};timers.push(entry);return entry;},clearTimeout(entry){if(entry)entry.cancelled=true;},
    landing:({error})=>`login:${error||''}`,shell:({data})=>`account:${data.user.id}`,
    navigation:()=>[['home','Inicio','home'],['profile','Mi perfil','user']],
    renderPatient:()=>'',renderAdmin:()=>'',stopAdminScanner(){},
    handlePatientAction:async()=>false,handleAdminAction:async()=>false,
    handlePatientSubmit:patientSubmit,handleAdminSubmit:adminSubmit,
    errorMessage:error=>String(error.message),formValues:valuesForForm,
    dateLabel:String,chileInput:String,chileToIso:String,
    createLiveService(){creations++;return serviceFor(currentUser,creations);},
    supabase:{auth:{getSession,signOut,stopAutoRefresh(){},onAuthStateChange(callback){authCallback=callback;}}},
  });
  vm.runInContext(source,context,{filename:'actual-main.js'});
  return {
    context,app,modal,toast,storage,events,
    run:code=>vm.runInContext(code,context),
    auth(event,id){currentUser=id;authCallback(event,id?{user:{id}}:null);},
    fireClose:()=>modalEvents.get('close')?.(),
    get creations(){return creations;},get reloads(){return reloads;},
    async flush(){
      for(let count=0;count<4;count++){
        const ready=timers.filter(entry=>entry.delay===0&&!entry.cancelled&&!entry.ran);
        for(const entry of ready){entry.ran=true;await entry.callback();}
        await tick();
      }
    },
  };
}

test('a same-account sign-in recovers after a rejected session verification',async()=>{
  let loads=0;
  const h=harness({serviceFor:id=>({load:async()=>{
    if(++loads===1)throw Object.assign(Error('Verify again'),{code:'SESSION_REQUIRED'});
    return snapshot(id);
  }})});
  h.auth('SIGNED_IN','patient-a');await h.flush();
  assert.equal(h.run('state.service'),null);
  assert.equal(h.run('gate.identity'),null);
  h.auth('SIGNED_IN','patient-a');await h.flush();
  assert.equal(h.run('state.data.user.id'),'patient-a');
  assert.equal(h.creations,2);
});

test('the auth callback clears private UI and invalidates QR work before its deferred load',async()=>{
  const h=harness();h.auth('SIGNED_IN','patient-a');await h.flush();
  const previousVersion=h.run('gate.version');
  h.run("modal.innerHTML='patient-a private QR';modal.open=true;");
  h.auth('SIGNED_IN','patient-b');
  assert.equal(h.run('state.data'),null);
  assert.equal(h.modal.innerHTML,'');assert.equal(h.modal.open,false);
  assert.equal(h.run(`gate.isCurrent(${previousVersion})`),false);
  await h.flush();assert.equal(h.run('state.data.user.id'),'patient-b');
});

test('a late old-account snapshot cannot replace the new account',async()=>{
  const old=deferred();
  const h=harness({serviceFor:id=>({load:()=>id==='patient-a'?old.promise:Promise.resolve(snapshot(id))})});
  h.auth('SIGNED_IN','patient-a');await h.flush();
  h.auth('SIGNED_IN','patient-b');await h.flush();
  old.resolve(snapshot('patient-a'));await tick();
  assert.equal(h.run('state.data.user.id'),'patient-b');
  assert.equal(h.app.innerHTML,'account:patient-b');
});

test('a stale verification error cannot sign out a replacement account',async()=>{
  const old=deferred();
  const h=harness({serviceFor:id=>({load:()=>id==='patient-a'?old.promise:Promise.resolve(snapshot(id))})});
  h.auth('SIGNED_IN','patient-a');await h.flush();
  h.auth('SIGNED_IN','patient-b');await h.flush();
  old.reject(Object.assign(Error('Expired old account'),{code:'SESSION_REQUIRED'}));await tick();
  assert.equal(h.run('state.data.user.id'),'patient-b');assert.equal(h.run('gate.identity'),'patient-b');
});

test('a late startup session does not replace a newer auth event',async()=>{
  const startup=deferred();
  const h=harness({getSession:()=>startup.promise});
  const boot=h.run('boot()');
  h.auth('SIGNED_IN','patient-b');await h.flush();
  startup.resolve({data:{session:{user:{id:'patient-a'}}},error:null});await boot;
  assert.equal(h.run('state.data.user.id'),'patient-b');assert.equal(h.creations,1);
});

test('renewing the same account preserves the current view and dialog',async()=>{
  const h=harness();h.auth('SIGNED_IN','patient-a');await h.flush();
  const previousVersion=h.run('gate.version');
  h.run("state.page='profile';modal.innerHTML='unfinished own form';modal.open=true;");
  h.auth('TOKEN_REFRESHED','patient-a');h.auth('SIGNED_IN','patient-a');await h.flush();
  assert.equal(h.run('gate.version'),previousVersion);assert.equal(h.creations,1);
  assert.equal(h.run('state.page'),'profile');assert.equal(h.modal.innerHTML,'unfinished own form');
});

test('a delayed close event cannot erase a newly opened dialog',()=>{
  const h=harness();
  h.run("show('Previous','old content');close();show('New','new content');");
  h.fireClose();
  assert.equal(h.modal.open,true);assert.match(h.modal.innerHTML,/new content/);
});

test('failed remote sign-out clears only the independent app authentication storage',async()=>{
  const h=harness({signOut:async()=>({error:Error('No network')})});
  h.storage.set('another-app-session','preserve-other-session');
  h.storage.set('medicita-contigo-auth-v2','own-session');
  h.auth('SIGNED_IN','patient-a');await h.flush();await h.run('logout()');
  assert.equal(h.storage.has('medicita-contigo-auth-v2'),false);
  assert.equal(h.storage.get('another-app-session'),'preserve-other-session');
  assert.equal(h.run('state.data'),null);assert.equal(h.reloads,1);
});

test('every rendered navigation control belongs to the role navigation',()=>{
  const layoutSource=readFileSync(new URL('../web/src/layouts/app.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'');
  const context=vm.createContext({brand,icon,btn,esc,badge:()=>'',roleLabels:{patient:'Paciente',reception:'Recepción',admin:'Administración',supervisor:'Supervisión'},config:{configured:true}});
  vm.runInContext(layoutSource,context);
  for(const role of ['patient','reception','admin','supervisor']){
    context.input={data:{user:{role,full_name:'Test'},notifications:[],center:{}},page:role==='patient'?'home':'reports',content:'',prefs:{}};
    const html=vm.runInContext('shell(input)',context);
    const allowed=vm.runInContext(`navigation('${role}').map(item=>item[0])`,context);
    for(const [,page] of html.matchAll(/data-page="([^"]+)"/g))assert.ok(allowed.includes(page),`${role} renders unusable ${page}`);
    if(role==='supervisor')assert.doesNotMatch(html,/data-page="(?:profile|notifications|patients)"/);
  }
});

test('a named id input cannot prevent the real cancellation submit from reaching its RPC',async()=>{
  const calls=[];
  const h=harness({
    patientSubmit:actualPatientSubmit,
    valuesForForm:()=>({id:'appointment-a',reason:'Imprevisto personal'}),
    serviceFor:id=>({
      load:async()=>({...snapshot(id),
        settings:{cancellation_notice_minutes:0},
        slots:[{id:'slot-a',starts_at:new Date(Date.now()+2*86400000).toISOString()}],
        appointments:[{id:'appointment-a',patient_id:id,slot_id:'slot-a',status:'reserved'}],
      }),
      rpc:async(name,args)=>{calls.push({name,args});return null;},
    }),
  });
  h.auth('SIGNED_IN','patient-a');await h.flush();
  // HTMLFormElement.id becomes the input element when a control uses name=id.
  const form={id:{name:'id',value:'appointment-a'},getAttribute:name=>name==='id'?'patient-cancel-confirm':null};
  await h.events.get('submit')({target:form,preventDefault(){}});
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{name:'change_appointment',args:{p_id:'appointment-a',p_action:'cancel',p_reason:'Imprevisto personal'}});
  assert.match(h.toast.textContent,/cancelada correctamente/);
});

test('a named id input cannot replace the string dispatched to an administrative form handler',async()=>{
  let received;
  const h=harness({
    valuesForForm:()=>({id:'resource-a'}),
    adminSubmit:async(ctx,formId,values,form)=>{received={formId,values,form};return true;},
  });
  const form={id:{name:'id',value:'resource-a'},getAttribute:name=>name==='id'?'admin-resource-save':null};
  await h.events.get('submit')({target:form,preventDefault(){}});
  assert.equal(received.formId,'admin-resource-save');
  assert.equal(typeof received.formId,'string');assert.equal(received.values.id,'resource-a');
  assert.equal(received.form,form);
});
