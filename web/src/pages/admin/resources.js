import {esc, btn, badge, empty, rows, canOperate, canConfigure, guardStaff, guardAdmin, integer, number, truthy, options, statusBadge, ROOM_LABELS, WEEKDAYS, displayDate, chileInput, chileToIso, roomOf, professionalOf, serviceOf, closeButton, required, boundedNumber} from './common.js';

let resourceKind = 'service';
const kinds = {service: 'Prestaciones', professional: 'Profesionales', room: 'Boxes', schedule: 'Horarios de trabajo', block: 'Bloqueos de agenda', setting: 'Reglas del sistema'};
const singular = {service: 'prestación', professional: 'profesional', room: 'box', schedule: 'horario', block: 'bloqueo'};
const resourceArray = {service: 'services', professional: 'professionals', room: 'rooms', schedule: 'schedules', block: 'schedule_exceptions'};
const fieldMap = {service: ['id', 'name', 'duration_minutes', 'active'], professional: ['id', 'full_name', 'service_id', 'active'], room: ['id', 'name', 'specialty', 'active'], schedule: ['id', 'professional_id', 'room_id', 'weekday', 'start_time', 'end_time', 'active'], block: ['id', 'professional_id', 'room_id', 'starts_at', 'ends_at', 'reason', 'active']};
function resourceList(ctx, kind) { return rows(ctx.data[resourceArray[kind]]); }
function resourcePayload(kind, item) { return Object.fromEntries((fieldMap[kind] || []).filter(key => item[key] !== undefined).map(key => [key, item[key]])); }
function resourceTitle(ctx, kind, item) {
  if (kind === 'service' || kind === 'room') return item.name;
  if (kind === 'professional') return item.full_name;
  if (kind === 'schedule') return `${professionalOf(ctx.data, item.professional_id)?.full_name || 'Profesional'} · ${WEEKDAYS[number(item.weekday) - 1] || 'Día configurado'}`;
  return item.reason || 'Bloqueo de agenda';
}
function resourceDescription(ctx, kind, item) {
  if (kind === 'service') return `${integer(item.duration_minutes)} minutos por atención`;
  if (kind === 'professional') return serviceOf(ctx.data, item.service_id)?.name || 'Prestación por configurar';
  if (kind === 'room') return item.specialty || 'Prestación por configurar';
  if (kind === 'schedule') return `${String(item.start_time).slice(0, 5)} a ${String(item.end_time).slice(0, 5)} · ${roomOf(ctx.data, item.room_id)?.name || 'Box'}`;
  return `${displayDate(item.starts_at)} al ${displayDate(item.ends_at)} · ${item.professional_id ? professionalOf(ctx.data, item.professional_id)?.full_name || 'Profesional' : 'Todos los profesionales'} · ${item.room_id ? roomOf(ctx.data, item.room_id)?.name || 'Box' : 'Todos los boxes'}`;
}

export function renderRooms(ctx) {
  const data = ctx.data, canChange = canOperate(ctx);
  return `<section class="card"><div class="section-title"><div><p class="eyebrow">ESTADO INFORMADO POR EL EQUIPO</p><h2>Boxes del centro independiente</h2></div>${canConfigure(ctx) ? btn('Configurar boxes', 'admin-open-resources', 'room', 'secondary') : ''}</div><p class="muted">Un box libre no significa que exista una hora disponible. No se muestran identidades de otros pacientes en esta vista.</p></section><div class="room-grid grid grid-3">${rows(data.rooms).map(room => `<article class="card room-card ${esc(room.status)}"><div class="section-title"><span class="room-symbol" aria-hidden="true">▤</span>${statusBadge(room.status, ROOM_LABELS)}</div><h2>${esc(room.name)}</h2><p>${esc(room.specialty || 'Prestación configurada')}</p><p class="muted">Actualizado: ${esc(displayDate(room.updated_at))}</p>${room.active === false ? badge('Recurso inactivo', 'warning') : ''}${canChange && room.active !== false ? `<div class="actions">${btn('Cambiar estado', 'admin-room-status', room.id, 'secondary')}</div>` : ''}</article>`).join('') || `<section class="card">${empty('Todavía no hay boxes configurados', canConfigure(ctx) ? 'Crea los boxes desde la configuración de recursos.' : 'Administración debe configurar los boxes del centro.')}</section>`}</div>`;
}

function settingsForm(ctx) {
  const settings = ctx.data.settings || {};
  return `<section class="card stack"><h2>Reglas administrativas de este proyecto</h2><p class="muted">Estos valores pertenecen a Medicita Contigo y no se presentan como normas oficiales de un establecimiento.</p><form id="admin-settings-form" class="stack"><div class="form-grid"><div class="field"><label for="admin-setting-cancel">Límite para cancelar antes del inicio, en minutos</label><input type="number" name="cancellation_notice_minutes" id="admin-setting-cancel" min="0" max="10080" step="1" required value="${esc(settings.cancellation_notice_minutes ?? 0)}"><small>0 permite cancelar hasta antes del comienzo. Una cita sin respuesta nunca se cancela automáticamente.</small></div><div class="field"><label for="admin-setting-no-show">Tolerancia para registrar ausencia después del término, en minutos</label><input type="number" name="no_show_grace_minutes" id="admin-setting-no-show" min="0" max="1440" step="1" required value="${esc(settings.no_show_grace_minutes ?? 15)}"></div><div class="field"><label for="admin-setting-offer">Vigencia máxima de una oferta, en minutos</label><input type="number" name="offer_minutes" id="admin-setting-offer" min="1" max="10080" step="1" required value="${esc(settings.offer_minutes ?? 60)}"><small>La oferta siempre vence antes de comenzar la atención.</small></div><div class="field"><label for="admin-setting-early">Umbral de cancelación anticipada, en horas</label><input type="number" name="early_cancellation_hours" id="admin-setting-early" min="0" max="720" step="1" required value="${esc(settings.early_cancellation_hours ?? 24)}"></div></div><button class="btn btn-primary" type="submit">Guardar reglas</button></form></section>`;
}

export function renderResources(ctx) {
  if (!canConfigure(ctx)) return empty('Configuración restringida', 'Solo administración puede modificar los recursos y las reglas.');
  const list = resourceList(ctx, resourceKind);
  return `<section class="card stack"><div><p class="eyebrow">CONFIGURACIÓN DEL CENTRO INDEPENDIENTE</p><h2>Recursos y disponibilidad</h2><p class="muted">Configura prestaciones, profesionales, boxes y horarios de trabajo. Los bloqueos se consideran al crear y reservar horas.</p></div><div class="toolbar resource-tabs" role="group" aria-label="Tipo de recurso">${Object.entries(kinds).map(([kind, title]) => btn(title, 'admin-resource-tab', kind, resourceKind === kind ? 'primary' : 'secondary', `aria-pressed="${resourceKind === kind}"`)).join('')}</div></section>${resourceKind === 'setting' ? settingsForm(ctx) : `<section class="card"><div class="section-title"><h2>${esc(kinds[resourceKind])}</h2>${btn(`Agregar ${singular[resourceKind]}`, 'admin-resource-new', resourceKind)}</div>${list.length ? `<div class="resource-list grid ${['service', 'professional', 'room'].includes(resourceKind) ? 'grid-3' : 'grid-2'}">${list.map(item => `<article class="resource-card"><div class="section-title"><h3>${esc(resourceTitle(ctx, resourceKind, item))}</h3>${badge(item.active === false ? 'Inactivo' : 'Activo', item.active === false ? 'neutral' : 'success')}</div><p>${esc(resourceDescription(ctx, resourceKind, item))}</p><div class="resource-actions actions">${btn('Editar', 'admin-resource-edit', `${resourceKind}|${item.id}`, 'secondary')}${btn(item.active === false ? 'Activar' : 'Desactivar', 'admin-resource-toggle', `${resourceKind}|${item.id}`, 'ghost')}</div></article>`).join('')}</div>` : empty(`Aún no hay ${kinds[resourceKind].toLowerCase()} configurados`, 'Agrega el primer recurso para preparar la agenda.')}${resourceKind === 'service' ? '<p class="muted">15, 20, 30, 45 y 60 minutos son ejemplos de configuración; las duraciones reales las define el equipo para este proyecto.</p>' : ''}${resourceKind === 'block' ? '<p class="muted">Los bloqueos pueden representar feriados, ausencias de profesionales o mantención. No se solicitan causas clínicas.</p>' : ''}</section>`}`;
}

function activeCheckbox(item) { return `<label class="checkbox"><input type="checkbox" name="active" ${item.active !== false ? 'checked' : ''}> Recurso activo</label>`; }

function showResourceForm(ctx, kind, id = '') {
  guardAdmin(ctx);
  if (!Object.hasOwn(resourceArray, kind)) throw Error('El tipo de recurso no es válido.');
  const item = id ? resourceList(ctx, kind).find(resource => resource.id === id) : {};
  if (!item) throw Error('Este recurso ya no está cargado. Actualiza la vista.');
  const data = ctx.data, prefix = `admin-${kind}`, professionalOptions = options(data.professionals, {selected: item.professional_id, emptyLabel: kind === 'block' ? 'Todos los profesionales' : 'Selecciona un profesional', includeEmpty: true}), roomOptions = options(data.rooms, {selected: item.room_id, emptyLabel: kind === 'block' ? 'Todos los boxes' : 'Selecciona un box', includeEmpty: true});
  let fields = '';
  if (kind === 'service') fields = `<div class="field"><label for="${prefix}-name">Nombre de la prestación</label><input id="${prefix}-name" name="name" minlength="2" maxlength="100" required value="${esc(item.name || '')}" placeholder="Ejemplo: Medicina general"></div><div class="field"><label for="${prefix}-duration">Duración en minutos</label><input id="${prefix}-duration" name="duration_minutes" type="number" min="5" max="180" step="5" required value="${esc(item.duration_minutes ?? 30)}"><small>Configurable según la prestación. No corresponde a un estándar oficial.</small></div>`;
  if (kind === 'professional') fields = `<div class="field"><label for="${prefix}-name">Nombre del profesional</label><input id="${prefix}-name" name="full_name" minlength="2" maxlength="100" required value="${esc(item.full_name || '')}"></div><div class="field"><label for="${prefix}-service">Prestación</label><select id="${prefix}-service" name="service_id" required>${options(data.services, {selected: item.service_id, emptyLabel: 'Selecciona una prestación'})}</select></div>`;
  if (kind === 'room') {
    const specialties = [...new Set([item.specialty, ...rows(data.services).map(service => service.name)].filter(Boolean))];
    fields = `<div class="field"><label for="${prefix}-name">Nombre del box</label><input id="${prefix}-name" name="name" minlength="2" maxlength="100" required value="${esc(item.name || '')}"></div><div class="field"><label for="${prefix}-specialty">Prestación o especialidad</label>${specialties.length ? `<select id="${prefix}-specialty" name="specialty" required>${specialties.map(specialty => `<option ${item.specialty === specialty ? 'selected' : ''}>${esc(specialty)}</option>`).join('')}</select>` : `<input id="${prefix}-specialty" name="specialty" minlength="2" maxlength="100" required value="${esc(item.specialty || '')}" placeholder="Crea también la prestación correspondiente">`}</div>`;
  }
  if (kind === 'schedule') fields = `<div class="field"><label for="${prefix}-professional">Profesional</label><select id="${prefix}-professional" name="professional_id" required>${professionalOptions}</select></div><div class="field"><label for="${prefix}-room">Box</label><select id="${prefix}-room" name="room_id" required>${roomOptions}</select></div><div class="field"><label for="${prefix}-weekday">Día de la semana</label><select id="${prefix}-weekday" name="weekday" required>${WEEKDAYS.map((day, index) => `<option value="${index + 1}" ${number(item.weekday || 1) === index + 1 ? 'selected' : ''}>${esc(day)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label for="${prefix}-start">Desde, hora de Chile</label><input type="time" id="${prefix}-start" name="start_time" step="300" required value="${esc(String(item.start_time || '').slice(0, 5))}"></div><div class="field"><label for="${prefix}-end">Hasta, hora de Chile</label><input type="time" id="${prefix}-end" name="end_time" step="300" required value="${esc(String(item.end_time || '').slice(0, 5))}"></div></div><p class="muted">El cupo completo debe quedar dentro del horario configurado. Si hay un bloqueo, ese intervalo no estará disponible.</p>`;
  if (kind === 'block') fields = `<div class="field"><label for="${prefix}-professional">Profesional afectado</label><select id="${prefix}-professional" name="professional_id">${professionalOptions}</select></div><div class="field"><label for="${prefix}-room">Box afectado</label><select id="${prefix}-room" name="room_id">${roomOptions}</select><small>Selecciona al menos un profesional o un box.</small></div><div class="field"><label for="${prefix}-start">Inicio del bloqueo, hora de Chile</label><input id="${prefix}-start" name="starts_at" type="datetime-local" step="300" required value="${item.starts_at ? esc(chileInput(item.starts_at)) : ''}"></div><div class="field"><label for="${prefix}-end">Fin del bloqueo, hora de Chile</label><input id="${prefix}-end" name="ends_at" type="datetime-local" step="300" required value="${item.ends_at ? esc(chileInput(item.ends_at)) : ''}"></div><div class="field"><label for="${prefix}-reason">Descripción administrativa</label><input id="${prefix}-reason" name="reason" maxlength="200" required value="${esc(item.reason || '')}" placeholder="Feriado, mantención o ausencia administrativa"><small>No incluyas diagnósticos ni motivos clínicos personales.</small></div>`;
  ctx.show(`${id ? 'Editar' : 'Agregar'} ${singular[kind]}`, `<form id="admin-resource-form" class="stack"><input type="hidden" name="kind" value="${esc(kind)}"><input type="hidden" name="id" value="${esc(id)}">${fields}${activeCheckbox(item)}<div class="actions">${closeButton()}<button class="btn btn-primary" type="submit">Guardar ${singular[kind]}</button></div></form>`);
}

function buildPayload(kind, values) {
  const data = {active: truthy(values.active)};
  if (values.id) data.id = values.id;
  if (kind === 'service') {
    data.name = required(values.name, 'Escribe el nombre de la prestación.');
    data.duration_minutes = boundedNumber(values.duration_minutes, 5, 180, 'La duración debe estar entre 5 y 180 minutos.');
    if (data.duration_minutes % 5 !== 0) throw Error('Usa una duración en múltiplos de 5 minutos.');
  }
  if (kind === 'professional') { data.full_name = required(values.full_name, 'Escribe el nombre del profesional.'); data.service_id = required(values.service_id, 'Selecciona la prestación.'); }
  if (kind === 'room') { data.name = required(values.name, 'Escribe el nombre del box.'); data.specialty = required(values.specialty, 'Selecciona o escribe la prestación.'); }
  if (kind === 'schedule') {
    data.professional_id = required(values.professional_id, 'Selecciona el profesional.'); data.room_id = required(values.room_id, 'Selecciona el box.');
    data.weekday = boundedNumber(values.weekday, 1, 7, 'Selecciona un día de la semana.');
    data.start_time = required(values.start_time, 'Selecciona la hora inicial.'); data.end_time = required(values.end_time, 'Selecciona la hora final.');
    if (!/^\d{2}:\d{2}$/.test(data.start_time) || !/^\d{2}:\d{2}$/.test(data.end_time) || data.end_time <= data.start_time) throw Error('El horario debe terminar después de comenzar, dentro del mismo día.');
  }
  if (kind === 'block') {
    data.professional_id = values.professional_id || null; data.room_id = values.room_id || null;
    if (!data.professional_id && !data.room_id) throw Error('Selecciona al menos un profesional o un box para el bloqueo.');
    data.starts_at = chileToIso(required(values.starts_at, 'Selecciona el inicio del bloqueo.')); data.ends_at = chileToIso(required(values.ends_at, 'Selecciona el fin del bloqueo.'));
    if (new Date(data.ends_at) <= new Date(data.starts_at)) throw Error('El bloqueo debe terminar después de comenzar.');
    data.reason = required(values.reason, 'Escribe una descripción administrativa breve.');
    if (data.reason.length > 200) throw Error('La descripción puede tener hasta 200 caracteres.');
  }
  return data;
}

export async function handleResourceAction(ctx, action, id) {
  if (!['admin-room-status', 'admin-resource-tab', 'admin-resource-new', 'admin-resource-edit', 'admin-resource-toggle', 'admin-resource-toggle-confirm'].includes(action)) return false;
  if (action === 'admin-room-status') {
    guardStaff(ctx);
    const room = roomOf(ctx.data, id);
    if (!room) throw Error('El box no está disponible en la vista actual.');
    ctx.show('Actualizar estado del box', `<form id="admin-room-status-form" class="stack"><input name="room" type="hidden" value="${esc(id)}"><h3>${esc(room.name)}</h3><div class="field"><label for="admin-room-next-status">Estado informado por el personal</label><select id="admin-room-next-status" name="status">${Object.entries(ROOM_LABELS).map(([value, label]) => `<option value="${value}" ${room.status === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><p class="muted">Un box libre no crea una hora ni cambia una reserva. El estado queda registrado en el historial.</p><div class="actions">${closeButton()}<button class="btn btn-primary" type="submit">Guardar estado</button></div></form>`); return true;
  }
  guardAdmin(ctx);
  if (action === 'admin-resource-tab') { if (Object.hasOwn(kinds, id)) resourceKind = id; ctx.navigate('resources'); }
  if (action === 'admin-resource-new') showResourceForm(ctx, id);
  if (action === 'admin-resource-edit') { const [kind, resourceId] = String(id).split('|'); showResourceForm(ctx, kind, resourceId); }
  if (action === 'admin-resource-toggle' || action === 'admin-resource-toggle-confirm') {
    const [kind, resourceId] = String(id).split('|'), item = resourceList(ctx, kind).find(resource => resource.id === resourceId);
    if (!item) throw Error('El recurso ya no está cargado. Actualiza la vista.');
    if (action === 'admin-resource-toggle') ctx.show(`${item.active === false ? 'Activar' : 'Desactivar'} ${singular[kind]}`, `<div class="stack"><h3>${esc(resourceTitle(ctx, kind, item))}</h3><p>${item.active === false ? 'El recurso volverá a estar disponible para configurar la agenda.' : 'El recurso dejará de estar disponible para nuevas operaciones. Sus registros históricos se conservan. El servidor comprobará si existen reservas que impiden el cambio.'}</p><div class="actions">${closeButton()}${btn('Confirmar cambio', 'admin-resource-toggle-confirm', id, 'secondary')}</div></div>`);
    else await ctx.mutate('save_resource', {p_kind: kind, p_data: {...resourcePayload(kind, item), active: item.active === false}}, 'Disponibilidad del recurso actualizada.');
  }
  return true;
}

export function chooseResourceKind(kind) { if (Object.hasOwn(kinds, kind)) resourceKind = kind; }

export async function handleResourceSubmit(ctx, formId, values) {
  if (!['admin-room-status-form', 'admin-resource-form', 'admin-settings-form'].includes(formId)) return false;
  if (formId === 'admin-room-status-form') {
    guardStaff(ctx);
    if (!Object.hasOwn(ROOM_LABELS, values.status)) throw Error('Selecciona un estado de box válido.');
    await ctx.mutate('set_room', {p_id: required(values.room, 'Falta identificar el box.'), p_status: values.status}, 'Estado del box actualizado.'); return true;
  }
  guardAdmin(ctx);
  if (formId === 'admin-resource-form') {
    const kind = required(values.kind, 'Falta el tipo de recurso.');
    if (!Object.hasOwn(resourceArray, kind)) throw Error('El tipo de recurso no es válido.');
    await ctx.mutate('save_resource', {p_kind: kind, p_data: buildPayload(kind, values)}, `${singular[kind][0].toUpperCase() + singular[kind].slice(1)} guardado correctamente.`);
  }
  if (formId === 'admin-settings-form') {
    const settings = {
      cancellation_notice_minutes: boundedNumber(values.cancellation_notice_minutes, 0, 10080, 'El límite de cancelación debe estar entre 0 y 10080 minutos.'),
      no_show_grace_minutes: boundedNumber(values.no_show_grace_minutes, 0, 1440, 'La tolerancia de ausencia debe estar entre 0 y 1440 minutos.'),
      offer_minutes: boundedNumber(values.offer_minutes, 1, 10080, 'La vigencia de oferta debe estar entre 1 y 10080 minutos.'),
      early_cancellation_hours: boundedNumber(values.early_cancellation_hours, 0, 720, 'El umbral de cancelación anticipada debe estar entre 0 y 720 horas.'),
    };
    if (Object.values(settings).some(value => !Number.isInteger(value))) throw Error('Ingresa valores enteros para estas reglas.');
    await ctx.mutate('save_resource', {p_kind: 'setting', p_data: settings}, 'Reglas administrativas actualizadas.');
  }
  return true;
}
