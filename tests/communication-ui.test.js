import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCommunication,renderCallAlerts,renderPublicRoom,handleCommunicationAction,handleCommunicationSubmit,clearCommunicationState,updateCommentFeedback} from '../web/src/pages/communication.js';
import {renderProfile,renderRooms,accountAction,accountSubmit} from '../web/src/pages/patient/account.js';
import {renderCalendar} from '../web/src/pages/admin/calendar.js';

function harness(role='patient'){
 let version=1;const shown=[],mutations=[],requests=[],notices=[];
 const ctx={role,demo:false,data:{user:{id:`user-${role}`,role,full_name:'Sol',last_name:'Verde',preferences:{},onboarded:false},rooms:[{id:'room-3',name:'Box 3',active:true}],appointments:[],profiles:[],slots:[],offers:[],schedule_exceptions:[],settings:{}},filters:{from:'2026-11-24'},currentCalls:[],sessionVersion:()=>version,now:()=>new Date('2026-11-24T13:00:00Z'),show:(title,body)=>shown.push({title,body}),close:()=>requests.push('close'),notify:message=>notices.push(message),refresh:async()=>requests.push('refresh'),mutate:async(name,args,message,options)=>mutations.push({name,args,message,options}),service:{rpc:async(name,args)=>{requests.push({name,args});return {items:[],total:0,has_more:false};}}};
 return {ctx,shown,mutations,requests,notices,changeIdentity(){version++;ctx.data.user.id='another-user';},version:()=>version};
}
const call={id:'call-1',appointment_id:'appointment-1',turn_code:'MC-A7F2',room_name:'Box 3',status:'received',created_at:'2026-11-24T12:55:00Z',received_at:'2026-11-24T12:55:01Z'};

test('a patient understands a call and asks for help without replacing an open form',async()=>{
 const h=harness(),responses=[];h.ctx.currentCalls=[call];h.ctx.respondCall=async(id,response)=>responses.push({id,response});
 const html=renderCallAlerts(h.ctx);
 assert.match(html,/Es tu turno\. Dirígete al Box 3/);assert.match(html,/comm-call-understood/);assert.match(html,/comm-call-help/);assert.match(html,/role="status"/);assert.match(html,/aplicación cerrada/);
 await handleCommunicationAction(h.ctx,'comm-call-help',call.id);await handleCommunicationAction(h.ctx,'comm-call-understood',call.id);
 assert.deepEqual(responses,[{id:call.id,response:'help'},{id:call.id,response:'understood'}]);
 assert.deepEqual(h.shown,[]);assert.deepEqual(h.requests,[]);assert.deepEqual(h.mutations,[]);
 assert.equal(renderCallAlerts(h.ctx,[{...call,status:'understood'}]),'');
 assert.equal(renderCallAlerts(h.ctx,[{...call,closed_at:'2026-11-24T13:01:00Z'}]),'');
});
test('a late own-call response never refreshes a new identity',async()=>{
 const h=harness();let complete;h.ctx.service.rpc=()=>new Promise(resolve=>complete=resolve);h.ctx.refreshCalls=async()=>h.requests.push('refresh-calls');
 const pending=handleCommunicationAction(h.ctx,'comm-call-help',call.id);h.changeIdentity();complete();await pending;
 assert.deepEqual(h.requests,[]);assert.deepEqual(h.notices,[]);
});
test('public room strictly limits output to opaque turn, room and time even if extra fields arrive',()=>{
 const h=harness('admin');h.ctx.publicCalls=[{...call,status:'calling',patient_name:'PRIVATE FULL NAME',email:'private@example.invalid',message:'PRIVATE DIAGNOSIS',patient_id:'private-uuid'}];
 const html=renderPublicRoom(h.ctx);assert.match(html,/MC-A7F2/);assert.match(html,/Box 3/);assert.doesNotMatch(html,/PRIVATE|private@example|private-uuid/);
 h.ctx.publicCalls=[{...call,status:'calling',turn_code:'<script>evil()<\/script>',room_name:'<img src=x onerror=evil()>'}];
 const escaped=renderPublicRoom(h.ctx);assert.doesNotMatch(escaped,/<script>|<img/);assert.match(escaped,/&lt;script&gt;/);
});
test('staff can only create calls for loaded arrived appointments; retries reuse request identity',async()=>{
 clearCommunicationState();const h=harness('reception');h.ctx.data.appointments=[{id:'arrived',status:'arrived'},{id:'reserved',status:'reserved'}];
 await assert.rejects(handleCommunicationAction(h.ctx,'comm-call','reserved'),/llegada registrada/);
 await handleCommunicationAction(h.ctx,'comm-call','arrived');await handleCommunicationSubmit(h.ctx,'comm-call-create',{appointment:'arrived'});
 assert.equal(h.mutations.length,2);assert.equal(h.mutations[0].name,'call_to_box');assert.equal(h.mutations[0].args.p_appointment,'arrived');assert.equal(h.mutations[0].args.p_request_id,h.mutations[1].args.p_request_id);
 const patient=harness();patient.ctx.data.appointments=h.ctx.data.appointments;await assert.rejects(handleCommunicationAction(patient.ctx,'comm-call','arrived'),/personal autorizado/);
});
test('staff call states include receipt, understood and help; patient alerts never appear for staff or supervisor',()=>{
 for(const role of ['admin','reception','supervisor']){const h=harness(role);assert.equal(renderCallAlerts(h.ctx,[call]),'');}
 const h=harness('admin');h.ctx.currentCalls=[{...call,status:'help',patient_name:'Sol Ficticia'},{...call,id:'call-2',status:'understood',patient_name:'Luna Ficticia'}];
 const html=renderCommunication('calls',h.ctx);assert.match(html,/Aviso recibido|Recibido en la app/);assert.match(html,/Solicita ayuda/);assert.match(html,/Entendido por la persona/);assert.match(html,/comm-call-close/);
 assert.match(html,/\?sala=todas/);assert.doesNotMatch(html,/\?sala=todas&amp;demo=1/);
 h.ctx.demo=true;h.ctx.data.dataset_tag='medicita-december-2026-v1';
 const fictitious=renderCommunication('calls',h.ctx);assert.match(fictitious,/\?sala=todas&amp;demo=1&amp;dataset=december-2026/);
});
test('comments render untrusted text and reports safely and respect server edit permissions',async()=>{
 clearCommunicationState();const h=harness(),body='<img src=x onerror=alert(1)> Una observación segura';h.ctx.service.rpc=async()=>({items:[{id:'comment-1',room_id:'room-3',alias:'<script>alias</script>',body,status:'published',is_mine:true,can_edit:false,can_withdraw:true,created_at:'2026-11-24T12:00:00Z',edited_at:'2026-11-24T12:05:00Z',replies:[{id:'reply-1',room_id:'room-3',alias:'Not a real name',body:'Respuesta segura',is_staff:true,status:'published',created_at:'2026-11-24T12:06:00Z'}]}],total:1});
 await handleCommunicationAction(h.ctx,'comm-open-comments','room-3');const html=h.shown.at(-1).body;
 assert.doesNotMatch(html,/<img src=x|<script>/);assert.match(html,/&lt;img src=x/);assert.match(html,/Equipo Medicita/);assert.match(html,/Editado/);assert.doesNotMatch(html,/data-action="comm-comment-edit"/);assert.match(html,/comm-comment-withdraw/);assert.match(html,/maxlength="500"/);assert.match(html,/No compartas diagnósticos/);assert.match(html,/Sin coronitas por comentar/);
});
test('comments loaded for an old identity cannot reopen a modal',async()=>{
 clearCommunicationState();const h=harness();let complete;h.ctx.service.rpc=()=>new Promise(resolve=>complete=resolve);
 const pending=handleCommunicationAction(h.ctx,'comm-open-comments','room-3');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.shown.length,1);h.changeIdentity();complete({items:[{id:'old-private',body:'Old private comment'}]});await pending;assert.equal(h.shown.length,1);
});
test('a queued comment action is discarded if identity changes before its request starts',async()=>{
 clearCommunicationState();const h=harness();
 const pending=handleCommunicationAction(h.ctx,'comm-open-comments','room-3');h.changeIdentity();await pending;
 assert.deepEqual(h.shown,[]);assert.deepEqual(h.requests,[]);
});
test('comments send truthful validation feedback and enforce limits before server mutation',async()=>{
 clearCommunicationState();const h=harness();await assert.rejects(handleCommunicationSubmit(h.ctx,'comm-comment-create',{room:'room-3',body:'x'.repeat(501)}),/500/);assert.equal(h.mutations.length,0);
 await handleCommunicationSubmit(h.ctx,'comm-comment-create',{room:'room-3',alias:'Luz',body:'  La orientación de la sala fue clara.  '});
 assert.equal(h.mutations[0].name,'post_room_comment');assert.deepEqual(h.mutations[0].args,{p_room:'room-3',p_body:'La orientación de la sala fue clara.',p_parent:null,p_alias:'Luz'});assert.match(h.mutations[0].message,/validación/);assert.equal(h.requests[0].name,'get_room_comments');
});
test('manual review exposes report reasons safely and term changes remain admin-only',async()=>{
 const h=harness('admin');h.ctx.data.comment_moderation={items:[{id:'c1',body:'Observación',alias:'Sol',status:'published',created_at:'2026-11-24T12:00:00Z',reports:[{reason:'<script>reason</script>',created_at:'2026-11-24T12:03:00Z'}]}],terms:[{term:'Expresión de prueba',active:true}],total:1};
 const html=renderCommunication('moderation',h.ctx);assert.match(html,/Motivos de los reportes/);assert.match(html,/&lt;script&gt;reason/);assert.doesNotMatch(html,/<script>/);assert.match(html,/value="reported"/);assert.match(html,/comm-term-toggle/);
 const patient=harness();await assert.rejects(handleCommunicationSubmit(patient.ctx,'comm-term-form',{term:'prueba',reason:'Motivo suficiente',active:'yes'}),/administración/);assert.equal(patient.mutations.length,0);
});
test('live comment help counts characters and warns for common evasions without innocent partial matches',()=>{
 const counter={},help={classList:{toggle(){}}},field={matches:()=>true,closest:()=>({querySelector:selector=>selector==='[data-comm-count]'?counter:help})};
 field.value='W 3 O O O N';updateCommentFeedback(field);assert.equal(counter.textContent,'11/500 caracteres');assert.match(help.textContent,/Revisa el tono/);
 field.value='La computación y el apoyo fueron útiles.';updateCommentFeedback(field);assert.doesNotMatch(help.textContent,/Revisa el tono/);
 field.value='Escríbeme a alguien@example.invalid';updateCommentFeedback(field);assert.match(help.textContent,/datos de contacto/);
});
test('profile visual preferences persist separately from community form and simple toggle never onboards',async()=>{
 const h=harness(),html=renderProfile(h.ctx);assert.match(html,/Modo visual: personas sordas o con dificultades auditivas/);assert.match(html,/name="visual_mode"/);assert.match(html,/name="vibration_enabled"/);assert.ok(html.indexOf('</form>')<html.indexOf('id="reward-community-preferences"'));
 await accountAction(h.ctx,'patient-simple');assert.equal(h.mutations[0].name,'save_accessibility_preferences');assert.deepEqual(h.mutations[0].args,{p_preferences:{simple_mode:true}});
 await accountSubmit(h.ctx,'patient-profile-save',{name:'Sol',last_name:'Verde',visual_mode:'yes',vibration_enabled:'yes',reminders:['24']});assert.equal(h.mutations[1].name,'save_profile');assert.equal(h.mutations[1].args.p_preferences.visual_mode,true);assert.equal(h.mutations[1].args.p_preferences.vibration_enabled,true);
 assert.match(renderRooms(h.ctx),/comm-open-comments/);
});
test('calendar exposes the call action for arrived appointments only',()=>{
 const h=harness('admin');h.ctx.data.slots=[{id:'slot-arrived',room_id:'room-3',starts_at:'2026-11-24T13:00:00Z',ends_at:'2026-11-24T13:30:00Z'},{id:'slot-reserved',room_id:'room-3',starts_at:'2026-11-24T14:00:00Z',ends_at:'2026-11-24T14:30:00Z'}];h.ctx.data.appointments=[{id:'arrived',slot_id:'slot-arrived',status:'arrived'},{id:'reserved',slot_id:'slot-reserved',status:'reserved'}];
 const html=renderCalendar(h.ctx);assert.match(html,/data-action="comm-call" data-id="arrived"/);assert.doesNotMatch(html,/data-action="comm-call" data-id="reserved"/);
});
