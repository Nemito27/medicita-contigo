import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRewards,renderRewardSummary,renderCommunityPreferences,handleRewardAction,handleRewardSubmit} from '../web/src/pages/rewards.js';

const levels=[['first','Primera corona',5],['bronze','Corona de bronce',20],['silver','Corona de plata',50],['gold','Corona de oro',100],['contigo','Corona Con Tigo',200]].map(([key,name,threshold])=>({id:`level-${key}`,name,threshold,description:`Reconocimiento desde ${threshold} coronitas`,earned:key==='first',active:key==='first',earned_at:key==='first'?'2026-11-24T12:00:00Z':null}));
const missions=[['welcome','Recibir la bienvenida',1,1],['profile','Completar mi perfil',0,1],['first_confirmation','Primera confirmación',0,1],['first_attendance','Primera asistencia validada',0,1],['three_attendances','Tres asistencias validadas',0,3],['five_attendances','Cinco asistencias validadas',0,5]].map(([key,title,progress,target])=>({key,title,progress,target,completed:progress>=target,award_id:`mission-${key}`}));
const rules=[{key:'welcome',label:'Bienvenida',amount:5},{key:'profile',label:'Perfil completo',amount:3},{key:'confirmation',label:'Confirmación válida',amount:2},{key:'attendance',label:'Asistencia validada',amount:10}];
function fixture(role='patient'){
  const calls=[],dialogs=[],refreshes=[];
  let version=1;
  const user={id:'self',full_name:'Persona',last_name:'Prueba',role};
  const rewards={balance:5,level:levels[0],next_level:levels[1],progress:{current:0,target:15,percent:0},rules,missions,awards:levels,history:[{id:'entry-welcome',action:'welcome',amount:5,created_at:'2026-11-24T12:00:00Z',reason:'Bienvenida registrada una sola vez'}],validated_attendances:0,community:{opt_in:false,alias:'',avatar:'contigo'},symbolic:true};
  const ctx={role,demo:false,data:{user,rewards,community:{items:[],total:0,has_more:false},people_rewards:{items:[{...user,balance:5,level:levels[0],awards:levels,validated_attendances:0,is_demo:false},{id:'other',full_name:'Otra',last_name:'Persona',role:'patient',balance:25,level:levels[1],awards:levels.slice(0,2).map(x=>({...x,earned:true,active:true})),validated_attendances:2,is_demo:false}],total:2,limit:25,offset:0,has_more:false}},filters:{},sessionVersion:()=>version,show:(title,html)=>dialogs.push({title,html}),close:()=>calls.push({name:'close'}),navigate:page=>calls.push({name:'navigate',page}),refresh:async filters=>refreshes.push(filters),mutate:async(name,args)=>calls.push({name,args}),service:{rpc:async(name,args)=>{calls.push({name,args});return {items:[],total:0,has_more:false};}}};
  return {ctx,calls,dialogs,refreshes,setVersion:value=>{version=value;}};
}

test('own rewards render server values, all five levels and six tracked missions without implying health priority',()=>{
  const {ctx}=fixture();
  const html=renderRewards('rewards',ctx);
  assert.match(html,/data-reward-balance="5"/);
  assert.match(html,/data-reward-level="level-first"/);
  for(const mission of missions)assert.match(html,new RegExp(`data-mission-key="${mission.key}" data-mission-progress="${mission.progress}" data-mission-target="${mission.target}"`));
  for(const level of levels)assert.ok(html.includes(level.name));
  assert.match(html,/no se descuentan de tu saldo/);
  assert.match(html,/No son dinero ni otorgan prioridad clínica/);
  assert.match(html,/No necesitas solicitar atenciones/);
  assert.match(html,/No hay premios por reservar, cancelar o comentar/);
  const summary=renderRewardSummary(ctx);
  assert.match(summary,/5 coronitas/);
  assert.match(summary,/reward-open/);
  assert.doesNotMatch(summary,/reward-missions|reward-awards/);
});

test('unavailable rewards and community never substitute invented balances or participants',()=>{
  const {ctx}=fixture();delete ctx.data.rewards;delete ctx.data.community;
  assert.match(renderRewards('rewards',ctx),/No pudimos cargar tus coronitas/);
  assert.doesNotMatch(renderRewardSummary(ctx),/>5 coronitas|>0 coronitas/);
  assert.match(renderRewards('community',ctx),/Tu saldo: — coronitas/);
  assert.match(renderRewards('community',ctx),/No pudimos consultar la comunidad/);
  assert.match(renderRewards('people-rewards',ctx),/acceso restringido/);
  delete ctx.data.user;
  assert.match(renderRewards('rewards',ctx),/Ingresa para consultar/);
});

test('community renders only public alias/avatar/total/level, escaping content and never private fields',()=>{
  const {ctx}=fixture();ctx.data.community={items:[{id:'private-person-id',alias:'Luz <script>alert(1)</script>',avatar:'" onerror="alert(1)',balance:52,level:{name:'Corona de plata'},email:'private@example.com',phone:'+56912345678',appointments:[{diagnosis:'private diagnosis'}],history:[{reason:'private reason'}],is_self:false}],total:1,has_more:false};
  const html=renderRewards('community',ctx);
  assert.match(html,/Luz &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/52 coronitas/);
  assert.doesNotMatch(html,/<script>|onerror=|private-person-id|private@example.com|56912345678|private diagnosis|private reason/);
  assert.match(html,/Tu saldo: 5 coronitas/);
  assert.match(html,/Compartir tu reconocimiento es opcional/);
  assert.match(renderCommunityPreferences(ctx),/name="opt_in" value="yes">/);
});

test('community opt-out accepts an empty alias; opt-in validates canonical alias and catalog before the RPC',async()=>{
  const {ctx,calls}=fixture();
  await handleRewardSubmit(ctx,'reward-community-preferences',{alias:'',avatar:'contigo'});
  assert.deepEqual(calls[0],{name:'save_community_preferences',args:{p_opt_in:false,p_alias:'',p_avatar:'contigo'}});
  await handleRewardSubmit(ctx,'reward-community-preferences',{opt_in:'yes',alias:'Sol 2',avatar:'sun'});
  assert.deepEqual(calls[1].args,{p_opt_in:true,p_alias:'Sol 2',p_avatar:'sun'});
  for(const alias of ['A','Demasiado largo para un alias público','correo@example.com','Persona 123456','httpEnlace','wwwSitio'])await assert.rejects(handleRewardSubmit(ctx,'reward-community-preferences',{opt_in:'yes',alias,avatar:'sun'}),/alias/);
  await assert.rejects(handleRewardSubmit(ctx,'reward-community-preferences',{opt_in:'yes',alias:'Luna',avatar:'url-avatar'}),/avatar/);
  assert.equal(calls.length,2);
});

test('admin people view keeps real/demo context, permissions, server totals and bounded pagination',async()=>{
  const {ctx,dialogs,refreshes}=fixture('admin');ctx.data.people_rewards.has_more=true;
  const html=renderRewards('people-rewards',ctx);
  assert.match(html,/Registros reales/);
  assert.match(html,/Cuenta real registrada/);
  assert.match(html,/data-reward-person="other"/);
  assert.match(html,/2 encontradas/);
  assert.match(html,/reward-person-role" data-id="other"/);
  assert.doesNotMatch(html,/reward-person-role" data-id="self"/);
  assert.match(html,/reward-person-message/);
  assert.match(html,/reward-people-page" data-id="25"/);
  await handleRewardAction(ctx,'reward-person-role','other');
  assert.match(dialogs.at(-1).html,/id="reward-role-form"/);
  await handleRewardSubmit(ctx,'reward-people-filters',{query:'  Otra  ',level:'level-bronze',order:'crowns_asc'});
  assert.deepEqual(refreshes.at(-1),{people_query:'Otra',people_level:'level-bronze',people_order:'crowns_asc',people_offset:0});
  await handleRewardAction(ctx,'reward-people-page','25');
  assert.deepEqual(refreshes.at(-1),{people_offset:25});
  ctx.demo=true;
  const demo=renderRewards('people-rewards',ctx);
  assert.match(demo,/Datos ficticios de demostración/);
  assert.doesNotMatch(demo,/Cuenta real registrada|href="\.\/\?demo/);
});

test('patients cannot open admin details, adjust rewards, correct attendances or edit rules',async()=>{
  const {ctx,calls}=fixture();
  for(const action of ['reward-person-history','reward-person-adjust','reward-person-role','reward-rule-settings','reward-correct-attendance'])await assert.rejects(handleRewardAction(ctx,action,'other'),/permisos|autorizado/);
  for(const [id,values] of [['reward-adjust-form',{user:'other',amount:'1',reason:'Corrección válida'}],['reward-attendance-correction',{appointment:'appointment-id',reason:'Validación errónea'}],['reward-rule-form',{key:'profile',amount:'4',reason:'Regla actualizada'}]])await assert.rejects(handleRewardSubmit(ctx,id,values),/permisos|autorizado/);
  assert.equal(calls.length,0);
});

test('reasoned admin adjustments append the exact RPC and reject invalid amounts or reasons',async()=>{
  const {ctx,calls,dialogs}=fixture('admin');
  await handleRewardAction(ctx,'reward-person-adjust','other');
  assert.match(dialogs.at(-1).html,/id="reward-adjust-form"/);
  assert.match(dialogs.at(-1).html,/historial anterior se conserva/);
  await handleRewardSubmit(ctx,'reward-adjust-form',{user:'other',amount:'-7',reason:'  Ajuste de un registro duplicado  '});
  assert.deepEqual(calls[0],{name:'adjust_coronitas',args:{p_user:'other',p_amount:-7,p_reason:'Ajuste de un registro duplicado'}});
  for(const amount of ['0','1.5','1001','no-es-número'])await assert.rejects(handleRewardSubmit(ctx,'reward-adjust-form',{user:'other',amount,reason:'Motivo válido del ajuste'}),/entero/);
  for(const reason of ['', 'corto','x'.repeat(301)])await assert.rejects(handleRewardSubmit(ctx,'reward-adjust-form',{user:'other',amount:'2',reason}),/8 y 300/);
  assert.equal(calls.length,1);
});

test('attendance correction references the correct appointment and keeps the original ledger visible',async()=>{
  const {ctx,calls,dialogs}=fixture('admin');
  const original={id:'ledger-original',action:'attendance',amount:10,created_at:'2026-11-24T12:00:00Z',reason:'Asistencia validada',appointment_id:'appointment-attended',correctable:true};
  const correction={id:'ledger-reversal',action:'attendance_correction',amount:-10,created_at:'2026-11-24T13:00:00Z',reason:'Validación por error',appointment_id:'appointment-old',correctable:false};
  ctx.service.rpc=async(name,args)=>{calls.push({name,args});return {items:[original,correction],total:2,has_more:false};};
  await handleRewardAction(ctx,'reward-person-history','other');
  const history=dialogs.at(-1).html;
  assert.match(history,/\+10/);assert.match(history,/-10/);
  assert.match(history,/reward-correct-attendance" data-id="appointment-attended"/);
  assert.doesNotMatch(history,/reward-correct-attendance" data-id="appointment-old"/);
  await handleRewardAction(ctx,'reward-correct-attendance','appointment-attended');
  assert.match(dialogs.at(-1).html,/movimiento original de coronitas se conserva/);
  await handleRewardSubmit(ctx,'reward-attendance-correction',{appointment:'appointment-attended',reason:'Validación accidental del personal'});
  assert.deepEqual(calls.at(-1),{name:'correct_attendance',args:{p_appointment:'appointment-attended',p_reason:'Validación accidental del personal'}});
});

test('history is escaped, paginated on the server and cannot reopen after an account switch',async()=>{
  const f=fixture('admin'),{ctx,calls,dialogs}=f;
  ctx.data.people_rewards.items[1].full_name='<img src=x onerror=alert(1)>';
  let finish;
  ctx.service.rpc=async(name,args)=>{calls.push({name,args});return new Promise(resolve=>{finish=resolve;});};
  const pending=handleRewardAction(ctx,'reward-person-history','other');
  await new Promise(resolve=>setImmediate(resolve));
  f.setVersion(2);finish({items:[{amount:7,reason:'Private previous account'}],total:1,has_more:false});
  await pending;
  assert.equal(dialogs.length,1);assert.doesNotMatch(dialogs[0].html,/Private previous account/);
  ctx.service.rpc=async(name,args)=>{calls.push({name,args});return {items:[{action:'adjustment',amount:-2,created_at:'2026-11-24T12:00:00Z',reason:'<script>bad()</script>'}],total:27,has_more:true};};
  await handleRewardAction(ctx,'reward-history-page','other|25');
  assert.deepEqual(calls.at(-1),{name:'get_reward_history',args:{p_user:'other',p_offset:25,p_limit:25}});
  const html=dialogs.at(-1).html;
  assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<script>|<img src=x/);
  assert.match(html,/reward-history-page" data-id="other\|0"/);
  assert.match(html,/reward-history-page" data-id="other\|50"/);
});
test('a queued rewards action is discarded if identity changes before its request starts',async()=>{
  const f=fixture('admin');
  const pending=handleRewardAction(f.ctx,'reward-person-history','other');f.setVersion(2);await pending;
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.dialogs,[]);
});

test('existing role and internal-message RPCs remain available, while own role changes are blocked',async()=>{
  const {ctx,calls}=fixture('admin');
  await handleRewardSubmit(ctx,'reward-role-form',{user:'other',role:'reception'});
  assert.deepEqual(calls[0],{name:'set_user_role',args:{p_user:'other',p_role:'reception'}});
  await assert.rejects(handleRewardSubmit(ctx,'reward-role-form',{user:'self',role:'patient'}),/permiso/);
  await assert.rejects(handleRewardSubmit(ctx,'reward-role-form',{user:'other',role:'invalid'}),/permiso/);
  await handleRewardSubmit(ctx,'reward-message-form',{user:'other',message:'  Tu solicitud administrativa está disponible.  '});
  assert.deepEqual(calls[1],{name:'admin_message',args:{p_user:'other',p_message:'Tu solicitud administrativa está disponible.'}});
});

test('rules use the API catalog and bounded integers with a mandatory audit reason',async()=>{
  const {ctx,calls,dialogs}=fixture('admin');
  await handleRewardAction(ctx,'reward-rule-settings');
  assert.match(dialogs.at(-1).html,/eventos futuros/);
  await handleRewardAction(ctx,'reward-edit-rule','attendance');
  assert.match(dialogs.at(-1).html,/name="key" value="attendance"/);
  await handleRewardSubmit(ctx,'reward-rule-form',{key:'attendance',amount:'12',reason:'Actualización aprobada de la regla'});
  assert.deepEqual(calls[0],{name:'save_reward_rule',args:{p_key:'attendance',p_amount:12,p_reason:'Actualización aprobada de la regla'}});
  await assert.rejects(handleRewardSubmit(ctx,'reward-rule-form',{key:'booking',amount:'1',reason:'Premio no permitido'}),/regla/);
  await assert.rejects(handleRewardSubmit(ctx,'reward-rule-form',{key:'attendance',amount:'101',reason:'Regla fuera de rango'}),/cantidad/);
  await assert.rejects(handleRewardSubmit(ctx,'reward-rule-form',{key:'attendance',amount:'10',reason:'corto'}),/8 y 300/);
  assert.equal(calls.length,1);
});

test('unknown actions/forms pass through and navigation/community pages preserve the caller contract',async()=>{
  const {ctx,calls,refreshes}=fixture();
  assert.equal(await handleRewardAction(ctx,'unrelated'),false);
  assert.equal(await handleRewardSubmit(ctx,'patient-profile-save',{}),false);
  await handleRewardAction(ctx,'reward-open');await handleRewardAction(ctx,'reward-open-community');
  assert.deepEqual(calls,[{name:'navigate',page:'rewards'},{name:'navigate',page:'community'}]);
  await handleRewardAction(ctx,'reward-community-page','25');
  assert.deepEqual(refreshes,[{community_offset:25}]);
  await assert.rejects(handleRewardAction(ctx,'reward-community-page','-1'),/página/);
});
