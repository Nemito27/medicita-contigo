import {esc, btn, badge, empty, mascot, rows, role, canOperate, canConfigure, guardStaff, integer, number, nowDate, dayKey, addDays, labelDay, displayDate, chileToIso, options, filterFields, closeButton, statusBadge, effectiveOfferStatus, OFFER_LABELS, activeAppointment, slotOf, roomOf, patientName, slotService, slotProfessional, slotDuration, required, boundedNumber, pagination} from './common.js';

let calendarView = 'day';
let cameraStream = null, cameraTimer = null, cameraVideo = null;

function currentDate(ctx) { return ctx.filters?.from || dayKey(nowDate(ctx)); }
function slotEnd(slot) { return new Date(slot.ends_at || new Date(slot.starts_at).getTime() + Math.max(5, slotDuration(slot) || 30) * 60000); }
function pendingForSlot(ctx, slot) { return rows(ctx.data.offers).find(offer => offer.slot_id === slot.id && effectiveOfferStatus(offer, nowDate(ctx)) === 'pending'); }
function currentAppointment(data, slot) { return rows(data.appointments).find(item => item.slot_id === slot.id && activeAppointment(item)); }
function slotBlocked(data, slot) {
  return slot.blocked || rows(data.schedule_exceptions).some(block => block.active !== false && (!block.room_id || block.room_id === slot.room_id) && (!block.professional_id || block.professional_id === slot.professional_id) && new Date(block.starts_at) < slotEnd(slot) && new Date(block.ends_at) > new Date(slot.starts_at));
}

function appointmentActions(ctx, appointment, slot) {
  const now = nowDate(ctx).getTime(), starts = new Date(slot.starts_at).getTime(), ends = slotEnd(slot).getTime();
  const grace = Math.max(0, number(ctx.data.settings?.no_show_grace_minutes ?? 15));
  const cancellationNotice = Math.max(0, number(ctx.data.settings?.cancellation_notice_minutes));
  let actions = btn('Ver detalle', 'admin-appointment', appointment.id, 'ghost');
  if (['reserved', 'confirmed'].includes(appointment.status)) {
    if (dayKey(slot.starts_at) === dayKey(nowDate(ctx))) actions += btn('Registrar llegada', 'admin-arrival', appointment.id, 'secondary');
    if (now >= ends + grace * 60000) actions += btn('Registrar ausencia', 'admin-no-show', appointment.id, 'secondary');
    if (starts - now > cancellationNotice * 60000) actions += btn('Liberar hora', 'admin-cancel', appointment.id, 'ghost');
  }
  if (appointment.status === 'arrived' && now >= starts) actions += btn('Finalizar atención', 'admin-complete', appointment.id);
  return `<div class="actions">${actions}</div>`;
}

function slotCard(ctx, slot) {
  const data = ctx.data, appointment = currentAppointment(data, slot), offer = pendingForSlot(ctx, slot), blocked = slotBlocked(data, slot), future = new Date(slot.starts_at).getTime() > nowDate(ctx).getTime();
  const state = appointment ? statusBadge(appointment.status) : blocked ? badge('Agenda bloqueada', 'danger') : offer ? statusBadge('pending', OFFER_LABELS) : future ? badge('Cupo disponible', 'success') : badge('Sin reserva registrada');
  return `<article class="calendar-slot ${appointment || offer || blocked ? 'is-occupied' : 'is-available'}"><div class="status-row"><strong>${esc(new Date(slot.starts_at).toLocaleTimeString('es-CL', {timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit'}))}</strong>${state}</div><h3>${esc(slotService(data, slot))}</h3><p>${esc(slotProfessional(data, slot))}<br>${esc(roomOf(data, slot.room_id)?.name || 'Box')} · ${integer(slotDuration(slot))} min</p>${appointment ? `<p><strong>${esc(patientName(data, appointment))}</strong></p>${appointmentActions(ctx, appointment, slot)}` : offer ? `<p class="muted">Esperando respuesta hasta ${esc(displayDate(offer.expires_at))}.</p>${btn('Revisar ofertas', 'admin-open-waiting', '', 'secondary')}` : blocked ? '<p class="muted">No se puede asignar durante un bloqueo.</p>' : future ? `<div class="actions">${btn('Revisar candidatos', 'admin-offer-slot', slot.id, 'secondary')}</div>` : ''}</article>`;
}

export function renderCalendar(ctx) {
  if (!canOperate(ctx)) return empty('Agenda restringida', 'La información de pacientes solo está disponible para el equipo de atención autorizado.');
  const date = currentDate(ctx), dates = Array.from({length: calendarView === 'week' ? 7 : 1}, (_, index) => addDays(date, index));
  const slots = rows(ctx.data.slots).filter(slot => dates.includes(dayKey(slot.starts_at))).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  return `<section class="card stack"><div class="section-title"><div><p class="eyebrow">AGENDA INDEPENDIENTE</p><h2>Organiza la atención</h2></div><div class="actions">${btn('Registrar llegada', 'admin-arrival', '', 'secondary')}${btn('Crear hora', 'admin-create-slot')}</div></div><form id="admin-calendar-filters">${filterFields(ctx, {prefix: 'admin-calendar', includeRange: false})}<div class="toolbar calendar-controls"><div class="field"><label for="admin-calendar-view">Vista</label><select name="view" id="admin-calendar-view"><option value="day" ${calendarView === 'day' ? 'selected' : ''}>Diaria</option><option value="week" ${calendarView === 'week' ? 'selected' : ''}>7 días</option></select></div><div class="actions">${btn('Anterior', 'admin-calendar-step', '-1', 'secondary')}<button class="btn btn-primary" type="submit">Mostrar agenda</button>${btn('Siguiente', 'admin-calendar-step', '1', 'secondary')}${btn('Hoy', 'admin-calendar-today', '', 'ghost')}</div></div></form><p class="muted">Horarios de Chile · America/Santiago. Cada prestación conserva su duración real. Crear o modificar aquí solo afecta Medicita Contigo.</p></section><div class="calendar-grid ${calendarView === 'week' ? 'calendar-week' : 'calendar-day'}">${dates.map(dateKey => { const daySlots = slots.filter(slot => dayKey(slot.starts_at) === dateKey); return `<section class="day-column"><div class="calendar-day-heading"><h2>${esc(labelDay(dateKey))}</h2><span>${integer(daySlots.length)} horas</span></div>${daySlots.length ? daySlots.map(slot => slotCard(ctx, slot)).join('') : empty('No hay horas para este día', 'Puedes crear una hora o cambiar los filtros.')}</section>`; }).join('')}</div>${pagination(ctx)}`;
}

export function showCreateSlot(ctx) {
  guardStaff(ctx);
  const rooms = rows(ctx.data.rooms).filter(item => item.active !== false), professionals = rows(ctx.data.professionals).filter(item => item.active !== false), services = rows(ctx.data.services).filter(item => item.active !== false);
  if (!rooms.length || !professionals.length || !services.length) {
    ctx.show('Antes de crear una hora', `${empty('Falta completar la configuración', 'Se necesita al menos un box, un profesional y una prestación activos.')}${canConfigure(ctx) ? btn('Configurar recursos', 'admin-open-resources') : '<p>Solicita al administrador completar los recursos del centro.</p>'}<div class="actions">${closeButton()}</div>`); return;
  }
  ctx.show('Crear hora en Medicita Contigo', `<form id="admin-slot-form" class="stack"><p class="muted">Solo se publicará en esta plataforma independiente. La disponibilidad se valida nuevamente al guardar.</p><div class="field"><label for="admin-slot-service">Prestación</label><select name="service" id="admin-slot-service" required>${options(services, {includeEmpty: false, label: item => `${item.name} · ${integer(item.duration_minutes)} min`})}</select></div><div class="field"><label for="admin-slot-professional">Profesional</label><select name="professional" id="admin-slot-professional" required>${options(professionals, {includeEmpty: false, label: item => `${item.full_name} · ${ctx.data.services.find(service => service.id === item.service_id)?.name || 'Prestación configurada'}`})}</select></div><div class="field"><label for="admin-slot-room">Box</label><select name="room" id="admin-slot-room" required>${options(rooms, {includeEmpty: false, label: item => `${item.name} · ${item.specialty || 'Configurado'}`})}</select></div><div class="field"><label for="admin-slot-start">Inicio de la atención, hora de Chile</label><input name="start" id="admin-slot-start" type="datetime-local" step="300" required></div><div class="field"><label for="admin-slot-duration">Duración</label><select id="admin-slot-duration" name="duration"><option value="">Usar duración de la prestación</option>${[15, 20, 30, 45, 60, 90, 120].map(minutes => `<option value="${minutes}">${minutes} minutos</option>`).join('')}</select><small>Son opciones de configuración de este proyecto; no corresponden a estándares oficiales de un CESFAM.</small></div><div class="notice">El box, profesional, horario de trabajo y los bloqueos deben ser compatibles. No se permiten atenciones superpuestas.</div><div class="actions">${closeButton()}<button class="btn btn-primary" type="submit">Crear hora disponible</button></div></form>`);
}

export function showAppointment(ctx, id) {
  guardStaff(ctx);
  const appointment = rows(ctx.data.appointments).find(item => item.id === id);
  if (!appointment) throw Error('La reserva ya no está en esta vista. Actualiza la agenda.');
  const slot = slotOf(ctx.data, appointment.slot_id), events = rows(ctx.data.appointment_events).filter(event => event.appointment_id === appointment.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  ctx.show('Detalle administrativo de la reserva', `<div class="stack"><div>${statusBadge(appointment.status)}<h3>${esc(patientName(ctx.data, appointment))}</h3><p><strong>${esc(slotService(ctx.data, slot))}</strong><br>${esc(displayDate(slot?.starts_at))}<br>${esc(slotProfessional(ctx.data, slot))} · ${esc(roomOf(ctx.data, slot?.room_id)?.name || 'Box')}</p></div><dl class="detail-list"><dt>Reserva registrada</dt><dd>${esc(displayDate(appointment.created_at))}</dd>${appointment.confirmed_at ? `<dt>Confirmación del paciente</dt><dd>${esc(displayDate(appointment.confirmed_at))}</dd>` : ''}${appointment.arrived_at ? `<dt>Llegada validada</dt><dd>${esc(displayDate(appointment.arrived_at))}</dd>` : ''}${appointment.cancelled_at ? `<dt>Cancelación</dt><dd>${esc(displayDate(appointment.cancelled_at))}</dd>` : ''}</dl>${events.length ? `<section><h3>Historial de esta reserva</h3><ol class="timeline">${events.map(event => `<li class="timeline-item"><strong>${esc(event.event)}</strong><p>${esc(displayDate(event.created_at))}</p>${event.detail ? `<small>${esc(typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail))}</small>` : ''}</li>`).join('')}</ol></section>` : '<p class="muted">No hay eventos adicionales cargados para esta reserva.</p>'}<div class="actions">${closeButton()}</div></div>`);
}

function showStatusConfirmation(ctx, id, action) {
  guardStaff(ctx);
  const appointment = rows(ctx.data.appointments).find(item => item.id === id);
  if (!appointment) throw Error('La reserva ya no está disponible. Actualiza la agenda.');
  const slot = slotOf(ctx.data, appointment.slot_id), absent = action === 'no_show';
  const grace = Math.max(0, number(ctx.data.settings?.no_show_grace_minutes ?? 15));
  ctx.show(absent ? 'Registrar ausencia' : 'Finalizar atención', `<div class="stack"><p><strong>${esc(patientName(ctx.data, appointment))}</strong><br>${esc(slotService(ctx.data, slot))}<br>${esc(displayDate(slot?.starts_at))}</p><div class="notice">${absent ? `Esta acción registra que la persona no se presentó. Solo está permitida después del término de la hora y ${integer(grace)} minutos de tolerancia. Una reserva sin confirmar no equivale a una ausencia.` : 'Esta acción registra una atención efectivamente realizada. El box pasará a transición.'}</div><div class="actions">${closeButton()}${btn(absent ? 'Confirmar ausencia' : 'Confirmar atención finalizada', absent ? 'admin-no-show-confirm' : 'admin-complete-confirm', id, absent ? 'secondary' : 'primary')}</div></div>`);
}

function showCancellation(ctx, id) {
  guardStaff(ctx);
  const appointment = rows(ctx.data.appointments).find(item => item.id === id), slot = slotOf(ctx.data, appointment?.slot_id);
  if (!appointment || !slot) throw Error('La reserva ya no está disponible. Actualiza la agenda.');
  const reasons = ['Prefiero no responder', 'Problema de horario', 'Trabajo o estudios', 'Problema de transporte', 'Imprevisto personal', 'Ya no necesito la atención', 'Otro motivo'];
  ctx.show('Liberar una reserva de Medicita Contigo', `<form id="admin-cancel-form" class="stack"><input type="hidden" name="appointment" value="${esc(id)}"><p><strong>${esc(patientName(ctx.data, appointment))}</strong><br>${esc(slotService(ctx.data, slot))} · ${esc(displayDate(slot.starts_at))}</p><div class="field"><label for="admin-cancel-reason">Motivo opcional informado por la persona</label><select name="reason" id="admin-cancel-reason">${reasons.map(reason => `<option>${esc(reason)}</option>`).join('')}</select></div><div class="notice">Se liberará este cupo dentro de Medicita Contigo. Los sistemas oficiales del centro no se modificarán. La nueva oferta se enviará después de revisar candidatos compatibles.</div><div class="actions">${closeButton()}<button class="btn btn-danger" type="submit">Confirmar liberación</button></div></form>`);
}

export function stopAdminScanner() {
  if (cameraTimer) clearTimeout(cameraTimer);
  cameraTimer = null;
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  if (cameraVideo) cameraVideo.srcObject = null;
  cameraVideo = null;
}

export function showArrival(ctx, id = '') {
  guardStaff(ctx); stopAdminScanner();
  const today = dayKey(nowDate(ctx)), eligible = rows(ctx.data.appointments).filter(appointment => ['reserved', 'confirmed'].includes(appointment.status) && slotOf(ctx.data, appointment.slot_id) && dayKey(slotOf(ctx.data, appointment.slot_id).starts_at) === today);
  ctx.show('Registrar llegada', `<div class="stack"><p>La llegada se valida el día de la reserva. El QR no contiene nombres ni información clínica.</p><form id="admin-checkin-token" class="stack"><div class="field"><label for="admin-checkin-code">Código de la credencial</label><input id="admin-checkin-code" name="token" autocomplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required></div><div class="actions">${btn('Escanear con cámara', 'admin-scan-start', '', 'secondary')}<button class="btn btn-primary" type="submit">Validar llegada por código</button></div><video id="admin-scanner-video" class="scanner-video" autoplay playsinline muted hidden aria-label="Cámara para leer el código QR"></video><p id="admin-scanner-status" role="status" class="muted">La cámara se activa únicamente al solicitarla. También puedes usar un lector externo o pegar el código.</p></form><details ${id ? 'open' : ''}><summary>Validar sin QR: identificación asistida por recepción</summary><p class="muted">Verifica la identidad con el procedimiento autorizado del centro y selecciona la reserva. No tener celular no impide recibir atención.</p>${eligible.length ? `<form id="admin-checkin-appointment" class="stack"><div class="field"><label for="admin-checkin-appointment-select">Reserva de hoy</label><select name="appointment" id="admin-checkin-appointment-select" required>${options(eligible, {includeEmpty: false, selected: id, label: appointment => `${patientName(ctx.data, appointment)} · ${displayDate(slotOf(ctx.data, appointment.slot_id)?.starts_at)} · ${slotService(ctx.data, slotOf(ctx.data, appointment.slot_id))}`})}</select></div><label class="checkbox"><input name="identity_checked" type="checkbox" required> Verifiqué la identidad y la reserva correspondiente.</label><button type="submit" class="btn btn-secondary">Registrar llegada asistida</button></form>` : '<p class="muted">No hay reservas de hoy por validar en la página cargada. Ajusta la fecha o la paginación de la agenda.</p>'}</details><div class="actions">${closeButton()}</div></div>`);
}

async function startScanner(ctx) {
  guardStaff(ctx); stopAdminScanner();
  const status = document.querySelector('#admin-scanner-status'), video = document.querySelector('#admin-scanner-video'), dialog = document.querySelector('#modal');
  if (!('BarcodeDetector' in globalThis) || !navigator.mediaDevices?.getUserMedia) {
    if (status) status.textContent = 'Este navegador no permite leer QR con cámara. Usa un lector externo, pega el código o valida la reserva mediante identificación asistida.';
    return;
  }
  const version = ctx.sessionVersion();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
    if (ctx.sessionVersion() !== version || !video?.isConnected || !dialog?.open) { stream.getTracks().forEach(track => track.stop()); return; }
    cameraStream = stream; cameraVideo = video; video.srcObject = stream; video.hidden = false; await video.play();
    const detector = new globalThis.BarcodeDetector({formats: ['qr_code']});
    if (status) status.textContent = 'Acerca la credencial a la cámara. Al leerla podrás confirmar la llegada.';
    dialog.addEventListener('close', stopAdminScanner, {once: true}); dialog.addEventListener('cancel', stopAdminScanner, {once: true});
    const scan = async () => {
      if (!cameraStream || ctx.sessionVersion() !== version || !video.isConnected || !dialog.open) { stopAdminScanner(); return; }
      try {
        const detected = await detector.detect(video), token = detected.map(code => code.rawValue).find(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
        if (ctx.sessionVersion() !== version || !cameraStream || !dialog.open) { stopAdminScanner(); return; }
        if (token) {
          const input = document.querySelector('#admin-checkin-code');
          if (input) { input.value = token; input.focus(); }
          if (status) status.textContent = 'Credencial leída. Revisa y pulsa «Validar llegada por código».';
          stopAdminScanner(); video.hidden = true; return;
        }
      } catch { if (status) status.textContent = 'Aún no pudimos leer el QR. Puedes usar el código manual.'; }
      cameraTimer = setTimeout(scan, 300);
    };
    cameraTimer = setTimeout(scan, 300);
  } catch {
    stopAdminScanner();
    if (status) status.textContent = 'No se pudo abrir la cámara. Revisa sus permisos o utiliza el código manual o la identificación asistida.';
  }
}

export async function handleCalendarAction(ctx, action, id) {
  if (!['admin-calendar-step', 'admin-calendar-today', 'admin-create-slot', 'admin-appointment', 'admin-arrival', 'admin-scan-start', 'admin-cancel', 'admin-complete', 'admin-no-show', 'admin-complete-confirm', 'admin-no-show-confirm'].includes(action)) return false;
  guardStaff(ctx);
  if (action !== 'admin-scan-start') stopAdminScanner();
  if (action === 'admin-calendar-step' || action === 'admin-calendar-today') {
    const from = action === 'admin-calendar-today' ? dayKey(nowDate(ctx)) : addDays(currentDate(ctx), (id === '-1' ? -1 : 1) * (calendarView === 'week' ? 7 : 1));
    await ctx.refresh({from, to: addDays(from, calendarView === 'week' ? 6 : 0), offset: 0}); return true;
  }
  if (action === 'admin-create-slot') showCreateSlot(ctx);
  if (action === 'admin-appointment') showAppointment(ctx, id);
  if (action === 'admin-arrival') showArrival(ctx, id);
  if (action === 'admin-scan-start') await startScanner(ctx);
  if (action === 'admin-cancel') showCancellation(ctx, id);
  if (action === 'admin-complete') showStatusConfirmation(ctx, id, 'complete');
  if (action === 'admin-no-show') showStatusConfirmation(ctx, id, 'no_show');
  if (action === 'admin-complete-confirm' || action === 'admin-no-show-confirm') await ctx.mutate('change_appointment', {p_id: id, p_action: action === 'admin-complete-confirm' ? 'complete' : 'no_show', p_reason: null}, action === 'admin-complete-confirm' ? 'Atención finalizada. El box quedó en transición.' : 'Ausencia registrada con fecha y responsable.');
  return true;
}

export async function handleCalendarSubmit(ctx, formId, values) {
  if (!['admin-calendar-filters', 'admin-slot-form', 'admin-cancel-form', 'admin-checkin-token', 'admin-checkin-appointment'].includes(formId)) return false;
  guardStaff(ctx);
  if (formId === 'admin-calendar-filters') {
    calendarView = values.view === 'week' ? 'week' : 'day';
    const from = required(values.from, 'Selecciona la fecha de la agenda.');
    await ctx.refresh({from, to: addDays(from, calendarView === 'week' ? 6 : 0), service_id: values.service_id || '', professional_id: values.professional_id || '', room_id: values.room_id || '', offset: 0});
  }
  if (formId === 'admin-slot-form') {
    const start = chileToIso(required(values.start, 'Selecciona el inicio de la atención en hora de Chile.'));
    if (new Date(start).getTime() <= nowDate(ctx).getTime()) throw Error('La hora debe estar en el futuro.');
    const duration = values.duration ? boundedNumber(values.duration, 5, 180, 'Selecciona una duración válida entre 5 y 180 minutos.') : null;
    await ctx.mutate('create_slot', {p_room: required(values.room, 'Selecciona un box.'), p_professional: required(values.professional, 'Selecciona un profesional.'), p_service: required(values.service, 'Selecciona una prestación.'), p_start: start, p_duration: duration}, 'Hora creada y disponible dentro de Medicita Contigo.');
  }
  if (formId === 'admin-cancel-form') await ctx.mutate('change_appointment', {p_id: required(values.appointment, 'Falta la reserva.'), p_action: 'cancel', p_reason: values.reason && values.reason !== 'Prefiero no responder' ? String(values.reason) : null}, 'Reserva liberada en Medicita Contigo. Ahora puedes revisar candidatos compatibles.');
  if (formId === 'admin-checkin-token') {
    const token = required(values.token, 'Ingresa el código de la credencial.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) throw Error('El código debe tener el formato de una credencial UUID.');
    stopAdminScanner(); await ctx.mutate('register_arrival', {p_token: token, p_appointment: null}, 'Llegada registrada correctamente.');
  }
  if (formId === 'admin-checkin-appointment') {
    if (!values.identity_checked) throw Error('Confirma que verificaste la identidad y la reserva.');
    stopAdminScanner(); await ctx.mutate('register_arrival', {p_token: null, p_appointment: required(values.appointment, 'Selecciona la reserva de hoy.')}, 'Llegada asistida registrada correctamente.');
  }
  return true;
}
