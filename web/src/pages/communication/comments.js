import {esc,icon,btn,badge,empty,dateLabel,rows,staff,admin,requireAdmin,closeButton,privacyNotice,statusLabels,featureState,requestToken,currentRequest,sameSession,openDialogWith,validateBody,bodyField,fieldReason,safeNumber} from './common.js';

const moderationFilters={pending:'Pendientes y reportados',reported:'Con reportes por revisar',published:'Publicados',hidden:'Ocultos',withdrawn:'Retirados',all:'Todos'};
const stateTone=status=>status==='published'?'success':status==='pending'?'warning':'neutral';
function commentById(ctx,id){return featureState(ctx).get(`comment:${id}`)||rows(ctx.data?.comment_moderation?.items).find(item=>String(item.id)===String(id));}
function remember(ctx,items){for(const item of rows(items)){featureState(ctx).set(`comment:${item.id}`,item);remember(ctx,item.replies);}}
function renderComment(ctx,item,{moderation=false,reply=false}={}){
 const body=item.body??item.text??'',editable=item.is_mine&&item.status!=='withdrawn'&&item.can_edit!==false,withdrawable=item.is_mine&&item.status!=='withdrawn'&&item.can_withdraw!==false;
 const actions=[];
 if(editable)actions.push(btn('Editar','comm-comment-edit',item.id,'ghost'));
 if(withdrawable)actions.push(btn('Retirar','comm-comment-withdraw',item.id,'ghost'));
 if(!item.is_mine&&item.status==='published')actions.push(item.reported_by_me?badge('Reportado para revisión','neutral'):btn('Reportar','comm-comment-report',item.id,'ghost'));
 if(staff(ctx)&&!reply&&item.status!=='withdrawn')actions.push(btn('Responder como equipo','comm-comment-reply',item.id,'secondary'));
 if(admin(ctx)&&moderation)actions.push(btn('Revisar estado','comm-moderate',item.id,'secondary'));
 const reportCount=safeNumber(item.report_count,rows(item.reports).length);
 return `<article class="comm-comment ${item.is_staff?'comm-comment-staff':''}" data-comment-id="${esc(item.id)}"><header><div><strong>${esc(item.is_staff?'Equipo Medicita':item.alias||'Persona de la comunidad')}</strong>${item.is_staff?badge('Respuesta del equipo','success'):''}</div><div class="comm-comment-meta"><time datetime="${esc(item.created_at)}">${esc(dateLabel(item.created_at))}</time>${item.edited_at?'<span>Editado</span>':''}${badge(statusLabels[item.status]||'En revisión',stateTone(item.status))}${moderation&&reportCount?badge(`${reportCount} reporte${reportCount===1?'':'s'}`,'warning'):''}</div></header>${moderation&&item.room_name?`<p class="muted">${esc(item.room_name)}</p>`:''}<p class="comm-comment-text">${esc(body)}</p>${moderation&&rows(item.reports).length?`<details class="comm-report-details"><summary>Motivos de los reportes (${rows(item.reports).length})</summary><ul>${rows(item.reports).map(report=>`<li><p>${esc(report.reason)}</p><small>${esc(dateLabel(report.created_at))} · ${report.resolved_at?'Revisado':'Por revisar'}</small></li>`).join('')}</ul></details>`:''}${item.is_mine&&item.moderation_reason?`<p class="notice">Revisión del equipo: ${esc(item.moderation_reason)}</p>`:''}${actions.length?`<div class="actions">${actions.join('')}</div>`:''}${!reply&&rows(item.replies).length?`<div class="comm-comment-replies" aria-label="Respuestas del equipo">${rows(item.replies).map(child=>renderComment(ctx,child,{moderation,reply:true})).join('')}${item.replies_has_more?'<p class="muted">Se muestran las 20 respuestas más recientes del equipo.</p>':''}</div>`:''}</article>`;
}
function composer(ctx,room){return `<section class="comm-compose"><h3>Comparte una observación</h3>${privacyNotice()}<form id="comm-comment-create" class="stack" data-comments-room="${esc(room.id)}"><input type="hidden" name="room" value="${esc(room.id)}">${staff(ctx)?'<p class="notice">Tu publicación se identificará como respuesta del equipo autorizado.</p>':'<div class="field"><label for="comm-comment-alias">Alias visible <span class="muted">(opcional)</span></label><input id="comm-comment-alias" name="alias" maxlength="30" autocomplete="nickname" placeholder="Un sobrenombre, sin correo ni teléfono"><small>Si lo dejas vacío, se usa el nombre de presentación definido por el servicio.</small></div>'}${bodyField()}<div class="actions"><button class="btn btn-primary" type="submit">Enviar comentario</button></div><p class="muted">Puedes editar tus comentarios publicados o pendientes durante 24 horas y retirarlos en cualquier momento. No es un canal de urgencias. Un filtro automático puede omitir expresiones ofensivas; puedes reportarlas para revisión manual.</p></form></section>`;}
function thread(ctx,room,payload,offset){
 remember(ctx,payload.items);
 return `<section class="stack" data-comments-room="${esc(room.id)}"><p class="muted">Observaciones sobre la experiencia y la organización de la sala. No se muestran citas ni quién está siendo atendido.</p>${privacyNotice()}<div class="comm-thread">${rows(payload.items).length?rows(payload.items).map(item=>renderComment(ctx,item)).join(''):empty('Todavía no hay comentarios','Puedes compartir una observación respetuosa sobre esta sala.')}</div><div class="actions">${offset?btn('Comentarios anteriores','comm-comments-page',`${room.id}|${Math.max(0,offset-20)}`,'secondary'):''}${payload.has_more?btn('Más comentarios','comm-comments-page',`${room.id}|${offset+20}`,'secondary'):''}</div>${composer(ctx,room)}<div class="actions">${closeButton()}</div></section>`;
}
export async function openComments(ctx,roomId,offset=0,{alreadyOpen=false}={}){
 const room=rows(ctx.data?.rooms).find(item=>String(item.id)===String(roomId));
 if(!room)throw Error('Ese box no está disponible en esta vista. Actualiza la información.');
 const token=requestToken(ctx);
 if(!alreadyOpen)ctx.show(`Comentarios · ${room.name}`,`<section data-comments-room="${esc(room.id)}"><p role="status">Cargando comentarios…</p>${privacyNotice()}</section>`);
 let response;
 try{response=await ctx.service.rpc('get_room_comments',{p_room:room.id,p_offset:offset,p_limit:20});}
 catch(error){if(!currentRequest(ctx,token)||!openDialogWith('[data-comments-room]'))return;ctx.show(`Comentarios · ${room.name}`,`<section class="stack" data-comments-room="${esc(room.id)}">${empty('No pudimos cargar los comentarios','Inténtalo nuevamente cuando tengas conexión.')}<div class="actions">${btn('Volver a intentar','comm-open-comments',room.id)}${closeButton()}</div></section>`);throw error;}
 if(!currentRequest(ctx,token)||!openDialogWith('[data-comments-room]'))return;
 const marker=typeof document==='undefined'?null:document.querySelector('[data-comments-room]');
 if(marker&&marker.dataset.commentsRoom!==String(room.id))return;
 featureState(ctx).set(`thread:${room.id}`,{response,offset});
 ctx.show(`Comentarios · ${room.name}`,thread(ctx,room,response||{items:[]},offset));
}
function showCommentEditor(ctx,item,reply=false){
 if(reply&&!staff(ctx))throw Error('Solo el equipo autorizado responde como personal.');
 if(!reply&&!item.is_mine)throw Error('Solo puedes editar tus propios comentarios.');
 ctx.show(reply?'Responder como equipo':'Editar mi comentario',`<form id="${reply?'comm-comment-reply-form':'comm-comment-edit-form'}" class="stack" data-comment-editor="${esc(item.id)}"><input type="hidden" name="comment" value="${esc(item.id)}"><input type="hidden" name="room" value="${esc(item.room_id)}">${reply?`<div class="notice"><strong>${esc(item.alias||'Comentario de la sala')}</strong><p class="comm-comment-text">${esc(item.body||'')}</p></div>`:'<p class="muted">La edición volverá a validarse y conservará el indicador de cambio.</p>'}${privacyNotice()}${bodyField(reply?'':item.body||'')}<div class="actions">${closeButton()}<button type="submit" class="btn btn-primary">${reply?'Enviar respuesta':'Guardar edición'}</button></div></form>`);
}
function moderationData(ctx){return ctx.data?.comment_moderation||featureState(ctx).get('moderation')||{items:[],terms:[],total:0};}
export function renderModeration(ctx){
 if(!admin(ctx))return empty('Revisión reservada a administración','El equipo autorizado revisa los reportes y las decisiones quedan auditadas.');
 const data=moderationData(ctx),status=ctx.filters?.moderation_status||'pending';remember(ctx,data.items);
 return `<div class="page-header"><div><p class="eyebrow">CONVIVENCIA EN LAS SALAS</p><h1>Comentarios y moderación</h1><p class="muted">Revisa el contenido y los reportes. Las respuestas del equipo se identifican claramente.</p></div>${btn('Actualizar revisión','comm-moderation-refresh','','secondary')}</div><section class="card stack"><form id="comm-moderation-filter" class="form-grid"><div class="field"><label for="comm-moderation-status">Estado</label><select id="comm-moderation-status" name="status">${Object.entries(moderationFilters).map(([key,label])=>`<option value="${key}" ${key===status?'selected':''}>${label}</option>`).join('')}</select></div><div class="actions"><button type="submit" class="btn btn-primary">Aplicar filtro</button></div></form>${privacyNotice()}<p class="muted">Los reportes no se resuelven únicamente con el filtro de palabras. Revisa el contexto antes de decidir.</p></section><section class="card stack"><div class="section-title"><h2>Contenido para revisión</h2><span>${safeNumber(data.total)} registros</span></div>${rows(data.items).length?rows(data.items).map(item=>renderComment(ctx,item,{moderation:true})).join(''):empty('No hay comentarios en este estado','Puedes cambiar el filtro o actualizar la revisión.')}<div class="actions">${safeNumber(ctx.filters?.moderation_offset)?btn('Página anterior','comm-moderation-page',String(Math.max(0,safeNumber(ctx.filters.moderation_offset)-25)),'secondary'):''}${data.has_more?btn('Página siguiente','comm-moderation-page',String(safeNumber(ctx.filters?.moderation_offset)+25),'secondary'):''}</div></section><section class="card stack"><div class="section-title"><h2>Expresiones del filtro</h2>${btn('Agregar expresión','comm-term-add','','secondary')}</div><p class="muted">La lista es configurable. Se comprueban palabras completas y evasiones frecuentes; no es una garantía de detección total.</p>${rows(data.terms).length?`<ul class="comm-term-list">${rows(data.terms).map(term=>{const value=typeof term==='string'?term:term.term,active=typeof term==='string'||term.active!==false;return `<li><span>${esc(value)}</span>${badge(active?'Activa':'Desactivada',active?'warning':'neutral')}${btn(active?'Desactivar':'Activar','comm-term-toggle',`${value}|${active?'0':'1'}`,'ghost')}</li>`;}).join('')}</ul>`:empty('La lista aún no está cargada','Actualiza la revisión para consultar su configuración.')}</section>`;
}
async function refreshModeration(ctx,patch={}){
 requireAdmin(ctx);const version=ctx.sessionVersion?.();
 const filters={...ctx.filters,...patch};
 const response=await ctx.service.rpc('get_comment_moderation',{p_status:filters.moderation_status||'pending',p_offset:safeNumber(filters.moderation_offset),p_limit:25});
 if(!sameSession(ctx,version))return;
 featureState(ctx).set('moderation',response);await ctx.refresh(patch);
}
export async function commentAction(ctx,action,id){
 if(action==='comm-open-comments'){await openComments(ctx,id);return true;}
 if(action==='comm-comments-page'){const [room,offset]=String(id).split('|');await openComments(ctx,room,Math.max(0,safeNumber(offset)));return true;}
 if(['comm-comment-edit','comm-comment-reply','comm-comment-withdraw','comm-comment-report','comm-moderate'].includes(action)){
  const item=commentById(ctx,id);if(!item)throw Error('El comentario ya no está cargado. Actualiza la sala o la revisión.');
  if(action==='comm-comment-edit'||action==='comm-comment-reply'){showCommentEditor(ctx,item,action==='comm-comment-reply');return true;}
  if(action==='comm-comment-withdraw'){
   if(!item.is_mine)throw Error('Solo puedes retirar tus propios comentarios.');
   ctx.show('Retirar mi comentario',`<form id="comm-comment-withdraw-form" class="stack"><input type="hidden" name="comment" value="${esc(id)}"><p>El comentario dejará de mostrarse a otras personas. Se conservará su registro administrativo.</p><div class="actions">${closeButton()}<button type="submit" class="btn btn-secondary">Retirar comentario</button></div></form>`);return true;
  }
  if(action==='comm-comment-report'){
   ctx.show('Reportar un comentario',`<form id="comm-comment-report-form" class="stack"><input type="hidden" name="comment" value="${esc(id)}">${fieldReason('comm-report-reason','¿Qué debe revisar el equipo?','',{min:2,max:200})}<p class="muted">El reporte es privado para administración y no entrega coronitas.</p><div class="actions">${closeButton()}<button type="submit" class="btn btn-primary">Enviar reporte</button></div></form>`);return true;
  }
  requireAdmin(ctx);ctx.show('Revisar estado del comentario',`<form id="comm-moderate-form" class="stack"><input type="hidden" name="comment" value="${esc(id)}"><div class="notice"><p class="comm-comment-text">${esc(item.body||'')}</p></div><div class="field"><label for="comm-next-status">Decisión</label><select id="comm-next-status" name="status">${Object.entries(statusLabels).map(([key,label])=>`<option value="${key}" ${item.status===key?'selected':''}>${label}</option>`).join('')}</select></div>${fieldReason('comm-moderate-reason')}<p class="muted">Se conservarán el contenido y la auditoría de esta decisión.</p><div class="actions">${closeButton()}<button type="submit" class="btn btn-primary">Guardar decisión</button></div></form>`);return true;
 }
 if(action==='comm-moderation-refresh'){await refreshModeration(ctx);return true;}
 if(action==='comm-moderation-page'){await refreshModeration(ctx,{moderation_offset:Math.max(0,safeNumber(id))});return true;}
 if(action==='comm-term-add'||action==='comm-term-toggle'){
  requireAdmin(ctx);const [term,active]=action==='comm-term-toggle'?String(id).split('|'):['','1'];
  ctx.show(action==='comm-term-add'?'Agregar expresión al filtro':'Cambiar expresión del filtro',`<form id="comm-term-form" class="stack"><div class="field"><label for="comm-term-value">Palabra o expresión</label><input id="comm-term-value" name="term" value="${esc(term)}" minlength="2" maxlength="60" required ${action==='comm-term-toggle'?'readonly':''}></div><label class="checkbox-field"><input type="checkbox" name="active" value="yes" ${active==='1'?'checked':''}>Mantener activa en el filtro</label>${fieldReason('comm-term-reason')}<div class="actions">${closeButton()}<button type="submit" class="btn btn-primary">Guardar configuración</button></div></form>`);return true;
 }
 return false;
}
export async function commentSubmit(ctx,formId,values){
 const version=ctx.sessionVersion?.();
 if(formId==='comm-comment-create'){
  const body=validateBody(values.body);await ctx.mutate('post_room_comment',{p_room:values.room,p_body:body,p_parent:null,p_alias:String(values.alias||'').trim()||null},'Tu comentario fue enviado para validación.',{keepOpen:true});
  if(sameSession(ctx,version)&&openDialogWith('[data-comments-room]'))await openComments(ctx,values.room,0,{alreadyOpen:true});return true;
 }
 if(formId==='comm-comment-edit-form'||formId==='comm-comment-reply-form'){
  const body=validateBody(values.body),reply=formId==='comm-comment-reply-form';
  await ctx.mutate(reply?'post_room_comment':'edit_room_comment',reply?{p_room:values.room,p_body:body,p_parent:values.comment,p_alias:null}:{p_id:values.comment,p_body:body},reply?'La respuesta del equipo fue enviada para validación.':'La edición fue enviada para validación.',{keepOpen:true});
  if(sameSession(ctx,version)&&openDialogWith('[data-comment-editor]')){ctx.close();await openComments(ctx,values.room);}return true;
 }
 if(formId==='comm-comment-withdraw-form'){await ctx.mutate('withdraw_room_comment',{p_id:values.comment},'Tu comentario fue retirado.');return true;}
 if(formId==='comm-comment-report-form'){
  const reason=String(values.reason||'').trim();if(reason.length<2||reason.length>200)throw Error('Explica qué debe revisar el equipo con entre 2 y 200 caracteres.');
  await ctx.mutate('report_room_comment',{p_id:values.comment,p_reason:reason},'El reporte quedó registrado para revisión.');return true;
 }
 if(formId==='comm-moderate-form'){
  requireAdmin(ctx);const reason=String(values.reason||'').trim();if(reason.length<5)throw Error('Indica el motivo de la decisión.');
  await ctx.mutate('moderate_room_comment',{p_id:values.comment,p_status:values.status,p_reason:reason},'La decisión de moderación quedó guardada y auditada.');
  if(sameSession(ctx,version))await refreshModeration(ctx);return true;
 }
 if(formId==='comm-term-form'){
  requireAdmin(ctx);const reason=String(values.reason||'').trim();if(reason.length<5)throw Error('Indica por qué cambias esta expresión.');
  await ctx.mutate('save_moderation_term',{p_term:String(values.term||'').trim(),p_active:values.active==='yes',p_reason:reason},'La configuración del filtro quedó guardada.');
  if(sameSession(ctx,version))await refreshModeration(ctx);return true;
 }
 if(formId==='comm-moderation-filter'){await refreshModeration(ctx,{moderation_status:values.status,moderation_offset:0});return true;}
 return false;
}
