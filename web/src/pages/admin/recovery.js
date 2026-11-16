import {esc, btn, badge, empty, rows, integer, number, nowDate, canOperate, canConfigure, isSupervisor, guardStaff, guardAdmin, options, statusBadge, OFFER_LABELS, ROLE_LABELS, WEEKDAYS, effectiveOfferStatus, displayDate, patientName, fullName, slotOf, slotService, slotProfessional, roomOf, closeButton, required, pagination} from './common.js';

let offerFilter = 'all';
const appointmentEvents = {
  reserved: 'Reserva registrada', booked: 'Reserva registrada', confirmed: 'Asistencia confirmada', confirm: 'Asistencia confirmada', arrived: 'Llegada registrada', completed: 'Atención finalizada', complete: 'Atención finalizada', cancelled: 'Reserva cancelada', cancel: 'Reserva cancelada', released: 'Cupo liberado', offered: 'Oferta enviada', offer_created: 'Oferta enviada', accepted: 'Oferta aceptada', declined: 'Oferta rechazada', expired: 'Oferta vencida', withdrawn: 'Oferta retirada', reassigned: 'Nueva asignación aceptada', rescheduled: 'Cambio de hora', no_show: 'Ausencia registrada', profile_updated: 'Perfil actualizado', room_updated: 'Estado de box actualizado', role_changed: 'Permiso actualizado', resource_saved: 'Configuración actualizada', waitlist_joined: 'Solicitud en espera', waitlist_updated: 'Disponibilidad actualizada', waitlist_left: 'Solicitud retirada', notification_created: 'Notificación interna', maintenance: 'Mantenimiento del sistema',
};
function preferenceLabel(wait) {
  const days = rows(wait.preferred_days).map(value => WEEKDAYS[Number(value) - 1]).filter(Boolean);
  const period = {any: 'Mañana o tarde', morning: 'Mañana', afternoon: 'Tarde'}[wait.preferred_period] || 'Mañana o tarde';
  return `${days.length ? days.join(', ') : 'Todos los días'} · ${period}`;
}

export function renderWaiting(ctx) {
  if (!canOperate(ctx)) return empty('Lista de espera restringida', 'Solo el equipo de atención autorizado puede consultar solicitudes personales.');
  const data = ctx.data, waiting = rows(data.waiting), offers = rows(data.offers).filter(offer => offerFilter === 'all' || effectiveOfferStatus(offer, nowDate(ctx)) === offerFilter);
  return `<section class="card stack"><div class="section-title"><div><p class="eyebrow">RECUPERACIÓN SUPERVISADA DE CUPOS</p><h2>De una cancelación a una oportunidad</h2></div>${btn('Buscar un cupo en agenda', 'admin-open-calendar', '', 'secondary')}</div><p>La compatibilidad considera prestación, disponibilidad y cruces de agenda. Para solicitudes equivalentes se usa la antigüedad administrativa; no se calcula urgencia clínica.</p><form id="admin-wait-filters" class="toolbar"><div class="field"><label for="admin-wait-service">Prestación</label><select name="service_id" id="admin-wait-service">${options(data.services, {selected: ctx.filters.service_id, emptyLabel: 'Todas las prestaciones'})}</select></div><div class="field"><label for="admin-offer-filter">Mostrar ofertas</label><select name="offer_status" id="admin-offer-filter">${[['all', 'Todos los estados'], ...Object.entries(OFFER_LABELS)].map(([value, text]) => `<option value="${value}" ${offerFilter === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></div><button type="submit" class="btn btn-secondary">Aplicar filtros</button></form></section><div class="grid grid-2"><section class="card"><div class="section-title"><h2>Solicitudes activas</h2>${badge(`${integer(waiting.length)} cargadas`)}</div>${waiting.length ? `<div class="resource-list">${waiting.map(wait => `<article class="resource-card"><h3>${esc(patientName(data, wait))}</h3><p><strong>${esc(wait.specialty || data.services.find(service => service.id === wait.service_id)?.name || 'Prestación')}</strong><br>${esc(displayDate(wait.earliest))} al ${esc(displayDate(wait.latest))}</p><p class="muted">${esc(preferenceLabel(wait))}</p><small>Solicitud: ${esc(displayDate(wait.created_at))}</small><div class="status-row">${badge(wait.old_appointment_id ? 'Solicita adelantar su reserva' : 'Sin reserva anterior vinculada')}${wait.receive_offers === false ? badge('Ofertas desactivadas', 'warning') : badge('Acepta recibir ofertas', 'success')}</div></article>`).join('')}</div>` : empty('No hay solicitudes con estos filtros', 'Las personas pueden indicar su disponibilidad desde su cuenta.')}</section><section class="card"><div class="section-title"><h2>Ofertas de cupos</h2>${badge(`${integer(offers.length)} cargadas`)}</div>${offers.length ? `<div class="resource-list">${offers.map(offer => { const slot = slotOf(data, offer.slot_id), status = effectiveOfferStatus(offer, nowDate(ctx)); return `<article class="resource-card"><div class="section-title"><h3>${esc(patientName(data, offer))}</h3>${statusBadge(status, OFFER_LABELS)}</div><p><strong>${esc(slotService(data, slot))}</strong><br>${esc(displayDate(slot?.starts_at))}<br>${esc(slotProfessional(data, slot))}</p><small>Enviada: ${esc(displayDate(offer.created_at))}<br>Vence: ${esc(displayDate(offer.expires_at))}${offer.responded_at ? `<br>Respuesta: ${esc(displayDate(offer.responded_at))}` : ''}</small>${status === 'pending' ? `<div class="actions">${btn('Retirar oferta', 'admin-withdraw-offer', offer.id, 'secondary')}</div>` : ''}</article>`; }).join('')}</div>` : empty('No hay ofertas con este estado', 'Revisa un cupo disponible de la agenda para proponerlo a una persona compatible.')}<div class="notice">Los avisos se muestran dentro de Medicita Contigo. No se afirma el envío de correo, SMS o WhatsApp si esos canales no están configurados.</div></section></div>${pagination(ctx)}`;
}

export async function showCandidates(ctx, slotId) {
  guardStaff(ctx);
  const slot = slotOf(ctx.data, slotId);
  if (!slot) throw Error('El cupo no está cargado. Actualiza o cambia la fecha de la agenda.');
  const version = ctx.sessionVersion();
  ctx.show('Buscando solicitudes compatibles', '<p role="status">Revisando prestación, disponibilidad y posibles cruces…</p>');
  const result = await ctx.service.rpc('compatible_candidates', {p_slot: slotId});
  if (ctx.sessionVersion() !== version) return;
  const candidates = rows(result);
  ctx.show('Ofrecer un cupo disponible', `<div class="stack"><div class="notice"><strong>${esc(slotService(ctx.data, slot))}</strong><br>${esc(displayDate(slot.starts_at))}<br>${esc(slotProfessional(ctx.data, slot))} · ${esc(roomOf(ctx.data, slot.room_id)?.name || 'Box')}</div><p>Solicitudes compatibles ordenadas por antigüedad administrativa. Revisa la propuesta antes de enviar; no corresponde a una clasificación de urgencia médica.</p>${candidates.length ? `<div class="resource-list">${candidates.map((wait, index) => `<article class="resource-card"><div class="section-title"><h3>${esc(wait.patient_name || patientName(ctx.data, wait))}</h3>${badge(`Solicitud ${integer(index + 1)} de esta lista`)}</div><p>${esc(preferenceLabel(wait))}<br>Inscripción: ${esc(displayDate(wait.created_at))}</p><p class="muted">${wait.old_appointment_id ? 'Conservará su reserva actual hasta aceptar el cambio.' : 'Si acepta, tendrá una reserva en este cupo.'}</p>${btn('Revisar envío de oferta', 'admin-review-offer', `${slotId}|${wait.id}`, 'secondary')}</article>`).join('')}</div>` : empty('Aún no hay personas compatibles', 'El cupo sigue disponible. Puedes actualizar la agenda cuando cambien las solicitudes.')}<div class="actions">${closeButton()}</div></div>`);
}

export function renderCancellations(ctx) {
  if (!canOperate(ctx)) return empty('Cancelaciones restringidas', 'Esta vista requiere permisos del equipo de atención.');
  const data = ctx.data, cancellations = rows(data.cancellations).slice().sort((a, b) => new Date(b.released_at) - new Date(a.released_at));
  return `<section class="card"><div class="section-title"><div><p class="eyebrow">TRAZABILIDAD DE LOS CUPOS</p><h2>Cancelaciones y recuperación</h2></div>${btn('Revisar agenda', 'admin-open-calendar', '', 'secondary')}</div><p class="muted">Cada cancelación registra su fecha de liberación y la nueva asignación, cuando existe. Solo se considera recuperado un cupo atendido por otra persona.</p>${cancellations.length ? `<div class="table-wrap"><table class="data-table"><caption class="sr-only">Reservas canceladas y estado de recuperación</caption><thead><tr><th>Hora liberada</th><th>Persona</th><th>Cancelación</th><th>Anticipación</th><th>Estado del cupo</th><th>Detalle</th></tr></thead><tbody>${cancellations.map(item => { const slot = slotOf(data, item.slot_id), current = rows(data.appointments).find(appointment => appointment.slot_id === item.slot_id && ['reserved', 'confirmed', 'arrived', 'completed'].includes(appointment.status)), offer = rows(data.offers).find(offer => offer.slot_id === item.slot_id && effectiveOfferStatus(offer, nowDate(ctx)) === 'pending'); let label = 'Sin nueva atención registrada', tone = 'neutral'; if (item.used_at) { label = 'Recuperado y atendido'; tone = 'success'; } else if (item.reassigned_at || current) { label = 'Con nueva reserva'; tone = 'warning'; } else if (offer) { label = 'Oferta pendiente'; tone = 'warning'; } else if (slot && new Date(slot.starts_at).getTime() > nowDate(ctx).getTime()) { label = 'Disponible'; tone = 'success'; } return `<tr><td><strong>${esc(displayDate(slot?.starts_at))}</strong><br><small>${esc(slotService(data, slot))}</small></td><td>${esc(patientName(data, item))}</td><td>${esc(displayDate(item.released_at))}</td><td>${item.notice_minutes === null || item.notice_minutes === undefined ? '—' : `${integer(Math.max(0, number(item.notice_minutes)))} min`}</td><td>${badge(label, tone)}</td><td>${btn('Ver trazabilidad', 'admin-cancellation-detail', item.id, 'ghost')}</td></tr>`; }).join('')}</tbody></table></div>` : empty('No hay cancelaciones en la vista actual', 'Cuando se libere una reserva, aparecerá su trazabilidad aquí.')}</section>${pagination(ctx)}`;
}

export function renderHistory(ctx) {
  const events = rows(ctx.data.audit_log).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), supervisor = isSupervisor(ctx);
  return `<section class="card"><div class="section-title"><div><p class="eyebrow">AUDITORÍA ${supervisor ? 'SIN DATOS DE PACIENTES' : 'DE OPERACIONES'}</p><h2>Actividad del sistema</h2></div>${badge(`${integer(events.length)} eventos cargados`)}</div><p class="muted">El historial registra operaciones importantes con fecha y responsable. ${supervisor ? 'La vista de supervisión presenta únicamente eventos sanitizados, sin identidades de pacientes.' : 'Solo se muestran los registros autorizados para tu rol y el período consultado.'}</p>${events.length ? `<ol class="timeline">${events.map(event => `<li class="timeline-item"><small>${esc(displayDate(event.created_at))}</small><h3>${esc(appointmentEvents[event.event] || event.event || 'Operación registrada')}</h3>${!supervisor && event.actor_name ? `<p>Responsable: ${esc(event.actor_name)}</p>` : ''}${!supervisor && event.detail ? `<p>${esc(typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail))}</p>` : ''}</li>`).join('')}</ol>` : empty('Aún no hay actividad para mostrar', 'Las operaciones de la plataforma generarán un registro.')}</section>${pagination(ctx)}`;
}

export function renderPatients(ctx) {
  if (!canConfigure(ctx)) return empty('Gestión de usuarios restringida', 'Solo administración puede gestionar las cuentas autorizadas.');
  const profiles = rows(ctx.data.profiles);
  return `<section class="card"><div class="section-title"><div><p class="eyebrow">CUENTAS Y PERMISOS</p><h2>Personas registradas</h2></div>${badge(`${integer(profiles.length)} cargadas`)}</div><p class="muted">El acceso con Google identifica una cuenta; no acredita inscripción en un CESFAM. El registro público siempre crea un paciente. Los permisos de personal se asignan de forma explícita.</p>${profiles.length ? `<div class="table-wrap"><table class="data-table"><caption class="sr-only">Cuentas y permisos de Medicita Contigo</caption><thead><tr><th>Nombre</th><th>Permiso</th><th>Acciones</th></tr></thead><tbody>${profiles.map(profile => `<tr><td><strong>${esc(fullName(profile))}</strong>${profile.id === ctx.data.user.id ? '<br><small>Tu cuenta actual</small>' : ''}</td><td>${badge(ROLE_LABELS[profile.role] || 'Paciente', profile.role === 'patient' ? 'neutral' : 'warning')}</td><td><div class="actions">${profile.id !== ctx.data.user.id ? btn('Cambiar permiso', 'admin-user-role', profile.id, 'secondary') : ''}${btn('Mensaje administrativo', 'admin-message', profile.id, 'ghost')}</div></td></tr>`).join('')}</tbody></table></div>` : empty('No hay cuentas cargadas en esta página', 'Ajusta la paginación para consultar otras cuentas.')}<div class="notice">La autorización se comprueba también en PostgreSQL. Nadie puede modificar su propio rol desde esta pantalla.</div></section>${pagination(ctx)}`;
}

function showRole(ctx, userId) {
  guardAdmin(ctx);
  const profile = rows(ctx.data.profiles).find(item => item.id === userId);
  if (!profile || userId === ctx.data.user.id) throw Error('No puedes cambiar tu propio permiso desde esta pantalla.');
  ctx.show('Cambiar permiso de una cuenta', `<form id="admin-role-form" class="stack"><input name="user" type="hidden" value="${esc(userId)}"><h3>${esc(fullName(profile))}</h3><div class="field"><label for="admin-user-role">Permiso autorizado</label><select name="role" id="admin-user-role">${Object.entries(ROLE_LABELS).map(([value, label]) => `<option value="${value}" ${profile.role === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><ul class="check-list"><li>Paciente: sus propias reservas y preferencias.</li><li>Recepción: agenda operativa, llegadas, boxes y ofertas.</li><li>Administrador: configura recursos y permisos.</li><li>Supervisor: indicadores agregados y auditoría sanitizada.</li></ul><p class="muted">Asigna funciones de personal únicamente a las cuentas autorizadas.</p><div class="actions">${closeButton()}<button class="btn btn-primary" type="submit">Guardar permiso</button></div></form>`);
}

function showMessage(ctx, userId) {
  guardStaff(ctx);
  const profile = rows(ctx.data.profiles).find(item => item.id === userId);
  if (!profile) throw Error('La persona no está cargada en esta vista.');
  ctx.show('Mensaje administrativo interno', `<form id="admin-message-form" class="stack"><input name="user" type="hidden" value="${esc(userId)}"><p>Para: <strong>${esc(fullName(profile))}</strong></p><div class="field"><label for="admin-message-text">Mensaje</label><textarea name="message" id="admin-message-text" minlength="3" maxlength="500" rows="4" required placeholder="Información administrativa, sin diagnósticos ni detalles clínicos"></textarea></div><p class="muted">Se mostrará dentro de la cuenta de Medicita Contigo. No se enviará por un canal externo.</p><div class="actions">${closeButton()}<button type="submit" class="btn btn-primary">Enviar aviso interno</button></div></form>`);
}

export async function handleRecoveryAction(ctx, action, id) {
  const actions = ['admin-offer-slot', 'admin-review-offer', 'admin-send-offer', 'admin-withdraw-offer', 'admin-withdraw-confirm', 'admin-cancellation-detail', 'admin-user-role', 'admin-message'];
  if (!actions.includes(action)) return false;
  guardStaff(ctx);
  if (action === 'admin-offer-slot') await showCandidates(ctx, id);
  if (action === 'admin-review-offer') {
    const [slotId, waitId] = String(id).split('|');
    const slot = slotOf(ctx.data, slotId), wait = rows(ctx.data.waiting).find(item => item.id === waitId);
    ctx.show('Revisar el envío de oferta', `<div class="stack"><p>${wait ? `<strong>${esc(patientName(ctx.data, wait))}</strong><br>` : ''}${esc(slotService(ctx.data, slot))}<br>${esc(displayDate(slot?.starts_at))}</p><div class="notice">La persona podrá aceptar o rechazar. Su reserva anterior se conserva hasta la aceptación. El servidor vuelve a comprobar disponibilidad, preferencias y cruces antes de enviar.</div><div class="actions">${closeButton()}${btn('Enviar oferta en Medicita', 'admin-send-offer', `${slotId}|${waitId}`)}</div></div>`);
  }
  if (action === 'admin-send-offer') {
    const [slotId, waitId] = String(id).split('|');
    if (!slotId || !waitId) throw Error('Falta identificar el cupo o la solicitud. Vuelve a revisar candidatos.');
    await ctx.mutate('make_offer', {p_slot: slotId, p_wait: waitId}, 'Oferta enviada. La persona recibirá el aviso dentro de Medicita Contigo.');
  }
  if (action === 'admin-withdraw-offer') {
    const offer = rows(ctx.data.offers).find(item => item.id === id);
    if (!offer || effectiveOfferStatus(offer, nowDate(ctx)) !== 'pending') throw Error('Esta oferta ya no está pendiente. Actualiza la vista.');
    ctx.show('Retirar oferta pendiente', `<div class="stack"><p>Se retirará la oferta a <strong>${esc(patientName(ctx.data, offer))}</strong>.</p><p>La reserva anterior de la persona se conserva y el cupo podrá ofrecerse nuevamente.</p><div class="actions">${closeButton()}${btn('Confirmar retiro', 'admin-withdraw-confirm', id, 'secondary')}</div></div>`);
  }
  if (action === 'admin-withdraw-confirm') await ctx.mutate('withdraw_offer', {p_id: id}, 'Oferta retirada. El cupo ya puede revisarse nuevamente.');
  if (action === 'admin-cancellation-detail') {
    const item = rows(ctx.data.cancellations).find(record => record.id === id);
    if (!item) throw Error('La cancelación no está cargada en esta página.');
    const slot = slotOf(ctx.data, item.slot_id);
    ctx.show('Trazabilidad de un cupo liberado', `<div class="stack"><h3>${esc(slotService(ctx.data, slot))}</h3><p>${esc(displayDate(slot?.starts_at))}<br>${esc(patientName(ctx.data, item))}</p><dl class="detail-list"><dt>Fecha de liberación</dt><dd>${esc(displayDate(item.released_at))}</dd><dt>Motivo opcional</dt><dd>${esc(item.reason || 'No informado')}</dd><dt>Nueva asignación</dt><dd>${item.reassigned_at ? esc(displayDate(item.reassigned_at)) : 'Aún no registrada'}</dd><dt>Cupo utilizado por otra persona</dt><dd>${item.used_at ? esc(displayDate(item.used_at)) : 'Aún no registrado'}</dd></dl><div class="notice">Una oferta enviada o aceptada no equivale a una atención efectivamente completada.</div><div class="actions">${closeButton()}</div></div>`);
  }
  if (action === 'admin-user-role') showRole(ctx, id);
  if (action === 'admin-message') showMessage(ctx, id);
  return true;
}

export async function handleRecoverySubmit(ctx, formId, values) {
  if (!['admin-wait-filters', 'admin-role-form', 'admin-message-form'].includes(formId)) return false;
  guardStaff(ctx);
  if (formId === 'admin-wait-filters') {
    offerFilter = ['all', ...Object.keys(OFFER_LABELS)].includes(values.offer_status) ? values.offer_status : 'all';
    await ctx.refresh({service_id: values.service_id || '', offset: 0});
  }
  if (formId === 'admin-role-form') {
    guardAdmin(ctx);
    const user = required(values.user, 'Falta identificar la cuenta.'), nextRole = required(values.role, 'Selecciona un permiso.');
    if (user === ctx.data.user.id || !Object.hasOwn(ROLE_LABELS, nextRole)) throw Error('El cambio de permiso solicitado no es válido.');
    await ctx.mutate('set_user_role', {p_user: user, p_role: nextRole}, 'Permiso actualizado. Se comprobará nuevamente en cada operación.');
  }
  if (formId === 'admin-message-form') {
    const message = required(values.message, 'Escribe el mensaje administrativo.');
    if (message.length < 3 || message.length > 500) throw Error('El mensaje debe tener entre 3 y 500 caracteres.');
    await ctx.mutate('admin_message', {p_user: required(values.user, 'Falta la cuenta destinataria.'), p_message: message}, 'Aviso interno enviado.');
  }
  return true;
}
