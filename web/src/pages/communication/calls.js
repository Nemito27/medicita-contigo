import {esc,icon,btn,badge,empty,dateLabel,rows,staff,requireStaff,callLabels,featureState,sameSession} from './common.js';

const openCalls=ctx=>rows(ctx.currentCalls??ctx.data?.box_calls).filter(call=>!call.closed_at);
const time=value=>value?esc(dateLabel(value)):'Todavía no se ha registrado';
const roomName=(ctx,appointment)=>rows(ctx.data?.rooms).find(room=>room.id===rows(ctx.data?.slots).find(slot=>slot.id===appointment.slot_id)?.room_id)?.name||'Box asignado';
function patientName(ctx,appointment){const person=[...rows(ctx.data?.profiles),...rows(ctx.data?.patients)].find(person=>person.id===appointment.patient_id);return appointment.patient_name||[person?.full_name,person?.last_name].filter(Boolean).join(' ')||'Persona con llegada registrada';}
function availableArrivals(ctx){return rows(ctx.data?.appointments).filter(appointment=>appointment.status==='arrived');}
function publicUrl(ctx,room=''){
 const path=typeof location==='undefined'?'./':location.pathname;
 const demo=ctx.demo?'&demo=1'+(ctx.data?.dataset_tag==='medicita-december-2026-v1'?'&dataset=december-2026':''):'';
 return `${path}?sala=${encodeURIComponent(room||'todas')}${demo}`;
}
function callCard(call){
 const help=call.status==='help';
 return `<article class="card comm-staff-call ${help?'comm-needs-help':''}" data-call-id="${esc(call.id)}"><div class="section-title"><div><p class="eyebrow">${help?'AYUDA SOLICITADA':'LLAMADO AL BOX'}</p><h3>${esc(call.patient_name||'Persona con llegada registrada')}</h3></div>${badge(callLabels[call.status]||'Estado por actualizar',help?'warning':call.status==='understood'?'success':'neutral')}</div><p><strong>Turno ${esc(call.turn_code||'Por asignar')} · ${esc(call.room_name||'Box asignado')}</strong></p><dl class="detail-list"><dt>Enviado</dt><dd>${time(call.created_at)}</dd><dt>Recibido en la app</dt><dd>${time(call.received_at)}</dd><dt>Respuesta</dt><dd>${time(call.responded_at)}</dd></dl>${help?'<p class="notice">La persona necesita apoyo. Coordina asistencia con el equipo del centro.</p>':''}<div class="actions">${btn('Cerrar llamado','comm-call-close',call.id,'secondary')}</div></article>`;
}
export function renderCalls(ctx){
 if(!staff(ctx))return empty('Llamados reservados al equipo','Los avisos personales aparecen en tu cuenta cuando el equipo registra un llamado.');
 const calls=openCalls(ctx),arrivals=availableArrivals(ctx),rooms=rows(ctx.data?.rooms).filter(room=>room.active!==false);
 return `<div class="page-header"><div><p class="eyebrow">COMUNICACIÓN SIN DEPENDER DEL AUDIO</p><h1>Llamados al box</h1><p class="muted">Llama a una persona con llegada validada y consulta su recepción o solicitud de ayuda.</p></div>${btn('Actualizar llamados','comm-calls-refresh','','secondary')}</div><section class="card stack"><h2>Crear llamado</h2>${arrivals.length?`<form id="comm-call-create" class="form-grid"><div class="field"><label for="comm-call-appointment">Persona con llegada registrada</label><select id="comm-call-appointment" name="appointment" required>${arrivals.map(appointment=>`<option value="${esc(appointment.id)}">${esc(patientName(ctx,appointment))} · ${esc(roomName(ctx,appointment))}</option>`).join('')}</select><small>Esta lista corresponde a la agenda cargada. Ajusta la fecha o la página de Agenda si falta una llegada.</small></div><div class="actions"><button type="submit" class="btn btn-primary">${icon('room')} Llamar al box</button></div></form>`:empty('No hay llegadas registradas en esta vista','Registra la llegada desde Agenda antes de enviar un llamado.')}<p class="muted">El servidor comprueba la llegada y envía el aviso únicamente a la cuenta correspondiente. El estado «recibido» indica recepción en la aplicación; «entendido» requiere una respuesta de la persona.</p></section><section class="stack" aria-label="Estado de los llamados">${calls.length?calls.map(callCard).join(''):empty('No hay llamados abiertos','Los avisos y sus respuestas aparecerán aquí.')}</section><section class="card stack"><h2>Pantalla pública de sala</h2><p>Comparte una pantalla con identificadores de turno y box. No muestra nombres ni motivos de consulta.</p><div class="actions"><a class="btn btn-secondary" href="${esc(publicUrl(ctx))}" target="_blank" rel="noopener noreferrer">Abrir todos los boxes</a>${rooms.map(room=>`<a class="btn btn-ghost" href="${esc(publicUrl(ctx,room.id))}" target="_blank" rel="noopener noreferrer">${esc(room.name)}</a>`).join('')}</div></section>`;
}
export function renderCallAlerts(ctx,calls=ctx.currentCalls??ctx.data?.box_calls){
 if(staff(ctx)||!ctx.data?.user||(ctx.role||ctx.data.user.role)==='supervisor')return '';
 const visible=rows(calls).filter(call=>!call.closed_at&&['pending','received','help'].includes(call.status));
 if(!visible.length)return '';
 return `<section class="comm-call-alerts" aria-label="Tus llamados al box">${visible.map(call=>`<article class="comm-call-alert ${call.status==='help'?'comm-needs-help':''}" data-visual-call="${esc(call.id)}" role="status" aria-live="polite" aria-atomic="true"><span class="comm-call-symbol" aria-hidden="true">${icon(call.status==='help'?'help':'room')}</span><div class="comm-call-copy"><p class="eyebrow">${call.status==='help'?'SOLICITUD DE AYUDA ENVIADA':'LLAMADO PERSONAL'}</p><h2>Es tu turno. Dirígete al ${esc(call.room_name||'box indicado')}.</h2>${call.turn_code?`<p class="comm-turn-reference">Tu turno: <strong>${esc(call.turn_code)}</strong></p>`:''}<p>${call.status==='help'?'El equipo recibió tu solicitud de ayuda. El aviso seguirá visible mientras el llamado esté abierto.':call.status==='received'?'Aviso recibido en tu aplicación. Puedes confirmar que lo entendiste o pedir ayuda.':'Puedes confirmar que entendiste el llamado o pedir ayuda.'}</p><div class="actions">${btn(`${icon('check')} Entendido`,'comm-call-understood',call.id,'primary')}${btn(`${icon('help')} Necesito ayuda`,'comm-call-help',call.id,'secondary',call.status==='help'?'disabled aria-disabled="true"':'')}</div><p class="comm-call-scope">Mantén Medicita abierta para recibir los avisos. No se envían notificaciones con la aplicación cerrada.</p></div></article>`).join('')}</section>`;
}
export function renderPublicRoom(ctx){
 const items=rows(ctx.publicCalls??ctx.data?.public_box_calls??featureState(ctx).get('public-calls')).filter(item=>item.status==='calling');
 return `<main class="comm-public-screen">${ctx.demo?'<p class="badge badge-warning">Datos ficticios de demostración · simulación local</p>':''}<header><p class="eyebrow">MEDICITA CONTIGO · PANTALLA DE SALA</p><h1>Llamados a box</h1><p>Busca tu identificador de turno y dirígete al box indicado.</p></header><section class="comm-public-grid" aria-label="Turnos llamados" aria-live="polite">${items.length?items.map(item=>`<article class="comm-public-turn"><p>Turno</p><strong>${esc(item.turn_code||'—')}</strong><h2>${esc(item.room_name||'Box')}</h2><p>${time(item.created_at)}</p></article>`).join(''):empty('Sin llamados en este momento','Los próximos turnos aparecerán en esta pantalla.')}</section><p class="muted">Esta pantalla muestra únicamente el identificador de turno y el box. No acredita una reserva ni una llegada.</p><div class="actions">${btn('Actualizar pantalla','comm-public-refresh','','secondary')}</div></main>`;
}
async function createCall(ctx,id){
 requireStaff(ctx);
 const appointment=availableArrivals(ctx).find(item=>String(item.id)===String(id));
 if(!appointment)throw Error('Solo puedes llamar una reserva con llegada registrada en la agenda cargada.');
 const key=`call-request:${appointment.id}`,state=featureState(ctx);
 let request=state.get(key);
 if(!request){request=globalThis.crypto?.randomUUID?.()||null;state.set(key,request);}
 await ctx.mutate('call_to_box',{p_appointment:appointment.id,p_request_id:request},'Llamado creado. Puedes consultar la recepción en Llamados al box.');
}
export async function callAction(ctx,action,id){
 if(action==='comm-call'){await createCall(ctx,id);return true;}
 if(action==='comm-calls-refresh'){requireStaff(ctx);if(ctx.refreshCalls)await ctx.refreshCalls();else await ctx.refresh();return true;}
 if(action==='comm-call-close'){requireStaff(ctx);await ctx.mutate('close_box_call',{p_id:id},'El llamado quedó cerrado. Su registro se conserva.');return true;}
 if(action==='comm-call-understood'||action==='comm-call-help'){
  if(staff(ctx)||!ctx.data?.user)throw Error('Esta respuesta corresponde a la persona que recibió el llamado.');
  const response=action==='comm-call-understood'?'understood':'help',version=ctx.sessionVersion?.();
  if(ctx.respondCall)await ctx.respondCall(id,response);
  else{
   await ctx.service.rpc('respond_box_call',{p_id:id,p_response:response});
   if(sameSession(ctx,version)){ctx.notify(response==='help'?'Tu solicitud de ayuda quedó enviada al equipo.':'Confirmaste que entendiste el llamado.');await ctx.refreshCalls?.();}
  }
  return true;
 }
 if(action==='comm-public-refresh'){
  const room=ctx.publicRoom||ctx.filters?.public_room||null;
  if(ctx.refreshPublicCalls)await ctx.refreshPublicCalls(room);
  else{
   const version=ctx.sessionVersion?.(),result=await ctx.service.rpc('get_public_box_calls',{p_room:room});
   if(sameSession(ctx,version)){featureState(ctx).set('public-calls',result);await ctx.refresh?.();}
  }
  return true;
 }
 return false;
}
export async function callSubmit(ctx,formId,values){if(formId!=='comm-call-create')return false;await createCall(ctx,values.appointment);return true;}
