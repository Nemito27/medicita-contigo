import {esc,btn,badge,empty,crown,integer,number,fullName,levelName,rows,historyList,assertAdmin,assertStaff,reason,requireId,stillCurrent,currentVersion,SYMBOLIC_NOTICE} from './shared.js';

const ROLE_LABELS={patient:'Paciente',reception:'Recepción',admin:'Administrador',supervisor:'Supervisor'};
let requestSequence=0;
function people(ctx){return rows(ctx.data?.people_rewards?.items);}
function person(ctx,id){return people(ctx).find(item=>String(item.id)===String(id))||rows(ctx.data?.profiles).find(item=>String(item.id)===String(id));}
function levelOptions(ctx){
  const levels=rows(ctx.data?.rewards?.awards).filter(item=>number(item.threshold)!==null);
  return levels.length?levels.map(item=>({id:item.id,name:item.name})):[];
}
function awardsFor(person){return rows(person?.awards).filter(award=>typeof award==='string'||(award.earned!==false&&award.active!==false));}
function awardNames(person){return awardsFor(person).map(item=>typeof item==='string'?item:item.name||'Galardón');}
function dataLabel(ctx,item){return item?.is_demo===true||ctx.demo?'Datos ficticios de demostración':'Cuenta real registrada';}

export function renderPeople(ctx){
  if(!['admin'].includes(ctx.role||ctx.data?.user?.role))return `<section class="card">${empty('Personas y coronitas: acceso restringido','Solo administración puede consultar este detalle de las cuentas registradas.')}</section>`;
  const result=ctx.data?.people_rewards,values=rows(result?.items),filters=ctx.filters||{};
  const offset=Number(filters.people_offset||result?.offset||0),limit=Number(result?.limit||25),levels=levelOptions(ctx);
  return `<div class="page-header"><div><p class="eyebrow">PERSONAS Y RECONOCIMIENTOS</p><h1>Clientes y coronitas</h1><p class="muted">Consulta personas registradas, permisos y el historial de sus reconocimientos.</p></div>${btn('Reglas de coronitas','reward-rule-settings','','secondary')}</div><section class="card stack"><div class="reward-people-context">${badge(ctx.demo?'Datos ficticios de demostración':'Registros reales',ctx.demo?'warning':'neutral')}<p>${ctx.demo?'Esta vista pertenece a la simulación y no contiene pacientes reales.':'Los datos ficticios de presentación están separados de esta lista y de la agenda real.'}</p>${!ctx.demo?'<a class="btn btn-ghost" href="./?demo=1&amp;dataset=december-2026&amp;day=2026-12-03">Abrir personas y agenda ficticias de diciembre</a>':''}</div><form id="reward-people-filters" class="reward-people-filters"><div class="field"><label for="reward-people-query">Buscar por nombre</label><input id="reward-people-query" name="query" type="search" maxlength="100" value="${esc(filters.people_query||'')}" placeholder="Nombre o apellido"></div><div class="field"><label for="reward-people-level">Galardón actual</label><select id="reward-people-level" name="level"><option value="">Todos los niveles</option>${levels.map(level=>`<option value="${esc(level.id)}" ${filters.people_level===level.id?'selected':''}>${esc(level.name)}</option>`).join('')}</select></div><div class="field"><label for="reward-people-order">Ordenar lista</label><select id="reward-people-order" name="order">${[['crowns_desc','Más coronitas primero'],['crowns_asc','Menos coronitas primero'],['name_asc','Nombre, de A a Z']].map(([id,label])=>`<option value="${id}" ${(filters.people_order||'crowns_desc')===id?'selected':''}>${label}</option>`).join('')}</select></div><button type="submit" class="btn btn-secondary">Aplicar filtros</button></form><p class="muted">El orden de esta lista no se utiliza para asignar horas, ofrecer cupos ni establecer prioridad clínica.</p></section><section class="card stack"><div class="section-title"><h2>Personas registradas</h2>${result?badge(`${integer(result.total)} encontradas`):''}</div>${!result?empty('No pudimos consultar los reconocimientos','Actualiza para volver a cargar la lista.',btn('Actualizar','reward-refresh','','secondary')):values.length?`<div class="reward-people-list">${values.map(item=>`<article class="reward-person" data-reward-person="${esc(item.id)}"><div class="reward-person-heading"><div><h3>${esc(fullName(item))}</h3><div class="reward-person-tags">${badge(ROLE_LABELS[item.role]||'Paciente',item.role==='patient'?'neutral':'warning')}${item.id===ctx.data.user.id?badge('Tu cuenta','success'):''}${badge(dataLabel(ctx,item),item.is_demo||ctx.demo?'warning':'neutral')}</div></div><span class="reward-person-balance">${crown()}<strong>${integer(item.balance)}</strong><small>coronitas</small></span></div><dl class="reward-person-facts"><div><dt>Galardón actual</dt><dd>${esc(levelName(item.level))}</dd></div><div><dt>Asistencias validadas</dt><dd>${integer(item.validated_attendances)}</dd></div><div><dt>Galardones obtenidos</dt><dd>${integer(awardsFor(item).length)}</dd></div></dl>${awardNames(item).length?`<p class="reward-person-awards">${awardNames(item).slice(0,3).map(name=>badge(name)).join('')}${awardNames(item).length>3?'<span class="muted">La colección completa está en el detalle.</span>':''}</p>`:''}<div class="actions">${btn('Ver historial y galardones','reward-person-history',item.id,'secondary')}${btn('Ajuste administrativo','reward-person-adjust',item.id,'ghost')}${item.id!==ctx.data.user.id?btn('Cambiar permiso','reward-person-role',item.id,'ghost'):''}${btn('Aviso interno','reward-person-message',item.id,'ghost')}</div></article>`).join('')}</div>`:empty('No hay personas que coincidan','Prueba otro nombre o selecciona todos los niveles.')}<div class="reward-pagination"><span class="muted">${result&&values.length?`${integer(offset+1)}–${integer(offset+values.length)} de ${integer(result.total)}`:''}</span><div class="actions">${offset>0?btn('Anterior','reward-people-page',Math.max(0,offset-limit),'secondary'):''}${result?.has_more?btn('Siguiente','reward-people-page',offset+limit,'secondary'):''}</div></div><div class="notice">${SYMBOLIC_NOTICE}</div></section>`;
}

export async function showHistory(ctx,userId=null,offset=0){
  if(userId)assertAdmin(ctx);
  const selected=userId?person(ctx,userId):ctx.data.user;
  const name=selected?fullName(selected):'Persona registrada';
  const marker=`reward-history-loading-${++requestSequence}`,version=currentVersion(ctx);
  ctx.show('Historial de coronitas',`<p id="${marker}" role="status">Consultando movimientos registrados…</p>`);
  const result=await ctx.service.rpc('get_reward_history',{p_user:userId||null,p_offset:offset,p_limit:25});
  if(!stillCurrent(ctx,version,marker))return;
  const items=rows(result?.items),allAwards=userId&&selected?awardNames(selected):[];
  ctx.show(userId?'Historial y galardones de una persona':'Mis movimientos de coronitas',`<div class="stack"><h3>${esc(name)}</h3>${selected?.balance!==undefined?`<p>${crown()} ${integer(selected.balance)} coronitas · ${esc(levelName(selected.level))}</p>`:''}${allAwards.length?`<div><h4>Galardones obtenidos</h4><div class="reward-person-awards">${allAwards.map(value=>badge(value,'success')).join('')}</div></div>`:''}${historyList(items,{correctable:Boolean(userId&&['admin','reception'].includes(ctx.role||ctx.data.user.role))})}<div class="reward-pagination"><span class="muted">${result?.total!==undefined?`${integer(result.total)} movimientos registrados`:''}</span><div class="actions">${offset>0?btn('Anterior','reward-history-page',`${userId||'self'}|${Math.max(0,offset-25)}`,'secondary'):''}${result?.has_more?btn('Siguiente','reward-history-page',`${userId||'self'}|${offset+25}`,'secondary'):''}${btn('Volver','reward-close','','secondary')}</div></div><p class="muted">Una corrección registra un nuevo movimiento y conserva el historial anterior.</p></div>`);
}

function showAdjustment(ctx,id){
  assertAdmin(ctx);const selected=person(ctx,id);
  if(!selected)throw Error('La persona ya no está cargada. Actualiza la lista.');
  ctx.show('Registrar ajuste administrativo',`<form id="reward-adjust-form" class="stack"><input type="hidden" name="user" value="${esc(id)}"><h3>${esc(fullName(selected))}</h3><p>El ajuste quedará como un movimiento nuevo, con su responsable y motivo. El historial anterior se conserva.</p><div class="field"><label for="reward-adjust-amount">Cantidad a sumar o corregir</label><input id="reward-adjust-amount" name="amount" type="number" step="1" min="-1000" max="1000" required inputmode="numeric"><small>Usa una cantidad distinta de cero. Los valores negativos se reservan para correcciones administrativas.</small></div><div class="field"><label for="reward-adjust-reason">Motivo obligatorio</label><textarea id="reward-adjust-reason" name="reason" minlength="8" maxlength="300" rows="3" required placeholder="Explica el error o la corrección administrativa, sin información clínica"></textarea></div><div class="notice">No apliques penalizaciones por enfermedad, discapacidad, ausencia ni cancelación.</div><div class="actions">${btn('Volver','reward-close','','secondary')}<button class="btn btn-primary" type="submit">Registrar ajuste auditado</button></div></form>`);
}

function showCorrection(ctx,appointment){
  assertStaff(ctx);
  ctx.show('Corregir una asistencia registrada por error',`<form id="reward-attendance-correction" class="stack"><input type="hidden" name="appointment" value="${esc(requireId(appointment))}"><p>El servidor comprobará la asistencia y registrará su corrección. El movimiento original de coronitas se conserva y se añade la reversión correspondiente.</p><p>Esta acción no corresponde a una penalización. Úsala únicamente cuando la asistencia se haya validado por error.</p><div class="field"><label for="reward-correction-reason">Motivo de la corrección</label><textarea id="reward-correction-reason" name="reason" minlength="8" maxlength="300" rows="3" required></textarea></div><div class="actions">${btn('Volver','reward-close','','secondary')}<button class="btn btn-primary" type="submit">Confirmar corrección auditada</button></div></form>`);
}

function showRole(ctx,id){
  assertAdmin(ctx);const selected=person(ctx,id);
  if(!selected||id===ctx.data.user.id)throw Error('No puedes modificar tu propio permiso desde esta pantalla.');
  ctx.show('Cambiar permiso de una cuenta',`<form id="reward-role-form" class="stack"><input type="hidden" name="user" value="${esc(id)}"><h3>${esc(fullName(selected))}</h3><div class="field"><label for="reward-person-role">Permiso autorizado</label><select id="reward-person-role" name="role">${Object.entries(ROLE_LABELS).map(([key,label])=>`<option value="${key}" ${selected.role===key?'selected':''}>${label}</option>`).join('')}</select></div><p>Asigna permisos de personal solo a cuentas autorizadas. El servidor comprueba esta operación y registra el cambio.</p><div class="actions">${btn('Volver','reward-close','','secondary')}<button class="btn btn-primary" type="submit">Guardar permiso</button></div></form>`);
}

function showMessage(ctx,id){
  assertAdmin(ctx);const selected=person(ctx,id);
  if(!selected)throw Error('La persona ya no está cargada. Actualiza la lista.');
  ctx.show('Aviso administrativo interno',`<form id="reward-message-form" class="stack"><input type="hidden" name="user" value="${esc(id)}"><p>Para: <strong>${esc(fullName(selected))}</strong></p><div class="field"><label for="reward-person-message">Mensaje</label><textarea id="reward-person-message" name="message" minlength="3" maxlength="500" required rows="4" placeholder="Información administrativa, sin diagnósticos ni datos clínicos"></textarea></div><p class="muted">El aviso se mostrará dentro de Medicita. No se envía correo, SMS ni WhatsApp.</p><div class="actions">${btn('Volver','reward-close','','secondary')}<button class="btn btn-primary" type="submit">Enviar aviso interno</button></div></form>`);
}

function showRules(ctx){
  assertAdmin(ctx);const rules=rows(ctx.data?.rewards?.rules);
  ctx.show('Reglas centralizadas de coronitas',`<div class="stack"><p>Los valores se guardan en el servidor. Cambiar una regla afecta los eventos futuros; no reescribe movimientos anteriores.</p>${rules.length?`<div class="reward-rule-settings">${rules.map(rule=>`<article><div><h3>${esc(rule.label||rule.key)}</h3><p>${crown()} ${integer(rule.amount)} coronitas</p></div>${btn('Cambiar regla','reward-edit-rule',rule.key,'secondary')}</article>`).join('')}</div>`:empty('No pudimos consultar las reglas','Actualiza los datos de tu cuenta para reintentar.')}<div class="notice">No se crean premios por reservas repetidas, cancelaciones ni comentarios. Las misiones entregan galardones, sin coronitas adicionales.</div><div class="actions">${btn('Volver','reward-close','','secondary')}</div></div>`);
}

function showRule(ctx,key){
  assertAdmin(ctx);const rule=rows(ctx.data?.rewards?.rules).find(item=>item.key===key);
  if(!rule)throw Error('La regla no está cargada. Actualiza la sección.');
  ctx.show('Actualizar una regla de recompensa',`<form id="reward-rule-form" class="stack"><input type="hidden" name="key" value="${esc(key)}"><h3>${esc(rule.label||key)}</h3><div class="field"><label for="reward-rule-amount">Coronitas por evento válido futuro</label><input id="reward-rule-amount" type="number" name="amount" min="0" max="100" step="1" value="${esc(rule.amount)}" required></div><div class="field"><label for="reward-rule-reason">Motivo obligatorio del cambio</label><textarea id="reward-rule-reason" name="reason" minlength="8" maxlength="300" required rows="3"></textarea></div><p class="muted">Los movimientos y sus valores anteriores se mantienen. Una atención conserva el importe aplicado a su proceso para evitar duplicados al corregir o reagendar.</p><div class="actions">${btn('Volver','reward-close','','secondary')}<button class="btn btn-primary" type="submit">Guardar regla auditada</button></div></form>`);
}

export async function peopleAction(ctx,action,id){
  if(action==='reward-own-history'){await showHistory(ctx);return true;}
  if(action==='reward-history-page'){
    const [user,rawOffset]=String(id).split('|'),offset=Number(rawOffset);
    if(!Number.isInteger(offset)||offset<0)throw Error('La página de movimientos no es válida.');
    await showHistory(ctx,user==='self'?null:requireId(user),offset);return true;
  }
  if(action==='reward-people-page'){assertAdmin(ctx);const offset=Number(id);if(!Number.isInteger(offset)||offset<0)throw Error('La página solicitada no es válida.');await ctx.refresh({people_offset:offset});return true;}
  if(action==='reward-person-history'){assertAdmin(ctx);await showHistory(ctx,requireId(id));return true;}
  if(action==='reward-person-adjust'){showAdjustment(ctx,id);return true;}
  if(action==='reward-correct-attendance'){showCorrection(ctx,id);return true;}
  if(action==='reward-person-role'){showRole(ctx,id);return true;}
  if(action==='reward-person-message'){showMessage(ctx,id);return true;}
  if(action==='reward-rule-settings'){showRules(ctx);return true;}
  if(action==='reward-edit-rule'){showRule(ctx,id);return true;}
  return false;
}

export async function peopleSubmit(ctx,formId,values){
  if(formId==='reward-people-filters'){
    assertAdmin(ctx);const query=String(values.query||'').trim();if(query.length>100)throw Error('La búsqueda es demasiado larga.');
    const order=['crowns_desc','crowns_asc','name_asc'].includes(values.order)?values.order:'crowns_desc';
    await ctx.refresh({people_query:query,people_level:String(values.level||''),people_order:order,people_offset:0});return true;
  }
  if(formId==='reward-adjust-form'){
    assertAdmin(ctx);const amount=Number(values.amount);if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>1000)throw Error('Usa un número entero distinto de cero, entre -1000 y 1000.');
    await ctx.mutate('adjust_coronitas',{p_user:requireId(values.user),p_amount:amount,p_reason:reason(values.reason)},'Ajuste registrado con su motivo en el historial.');return true;
  }
  if(formId==='reward-attendance-correction'){
    assertStaff(ctx);await ctx.mutate('correct_attendance',{p_appointment:requireId(values.appointment),p_reason:reason(values.reason)},'La corrección fue registrada; el historial original se mantiene.');return true;
  }
  if(formId==='reward-role-form'){
    assertAdmin(ctx);const user=requireId(values.user);if(user===ctx.data.user.id||!Object.hasOwn(ROLE_LABELS,values.role))throw Error('El permiso solicitado no es válido.');
    await ctx.mutate('set_user_role',{p_user:user,p_role:values.role},'Permiso actualizado y auditado.');return true;
  }
  if(formId==='reward-message-form'){
    assertAdmin(ctx);const message=String(values.message||'').trim();if(message.length<3||message.length>500)throw Error('El mensaje debe tener entre 3 y 500 caracteres.');
    await ctx.mutate('admin_message',{p_user:requireId(values.user),p_message:message},'Aviso interno registrado.');return true;
  }
  if(formId==='reward-rule-form'){
    assertAdmin(ctx);const key=String(values.key||''),amount=Number(values.amount);
    if(!rows(ctx.data?.rewards?.rules).some(item=>item.key===key)||!Number.isInteger(amount)||amount<0||amount>100)throw Error('Selecciona una regla y una cantidad entera entre 0 y 100.');
    await ctx.mutate('save_reward_rule',{p_key:key,p_amount:amount,p_reason:reason(values.reason)},'La regla fue guardada para los eventos futuros.');return true;
  }
  return false;
}
