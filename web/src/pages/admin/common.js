import {esc, icon, btn, badge, empty, mascot, dateLabel, dayKey, chileInput, chileToIso, addDays} from '../../components/ui.js';

export {esc, icon, btn, badge, empty, mascot, dateLabel, dayKey, chileInput, chileToIso, addDays};
export const rows = value => Array.isArray(value) ? value : [];
export const role = ctx => ctx.role || ctx.data?.user?.role || 'patient';
export const canOperate = ctx => ['admin', 'reception'].includes(role(ctx));
export const canConfigure = ctx => role(ctx) === 'admin';
export const isSupervisor = ctx => role(ctx) === 'supervisor';
export const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const nowDate = ctx => typeof ctx.now === 'function' ? new Date(ctx.now()) : new Date();
export const integer = value => new Intl.NumberFormat('es-CL', {maximumFractionDigits: 0}).format(number(value));
export const percent = value => `${new Intl.NumberFormat('es-CL', {maximumFractionDigits: 1}).format(number(value))}%`;
export const nullable = value => value === '' || value === undefined || value === null ? null : String(value);
export const truthy = value => value === true || value === 'true' || value === 'on' || value === '1';
export const validDate = value => value && Number.isFinite(new Date(value).getTime());
export const displayDate = value => validDate(value) ? dateLabel(value) : 'Sin fecha registrada';
export const labelDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  ? new Date(`${value}T15:00:00Z`).toLocaleDateString('es-CL', {timeZone: 'America/Santiago', day: 'numeric', month: 'short'})
  : 'Sin fecha';
export const serviceOf = (data, id) => rows(data.services).find(item => String(item.id) === String(id));
export const roomOf = (data, id) => rows(data.rooms).find(item => String(item.id) === String(id));
export const professionalOf = (data, id) => rows(data.professionals).find(item => String(item.id) === String(id));
export const slotOf = (data, id) => [...rows(data.slots), ...rows(data.available)].find(item => String(item.id) === String(id));
export const profileOf = (data, id) => rows(data.profiles).find(item => String(item.id) === String(id));
export const fullName = person => [person?.full_name, person?.last_name].filter(Boolean).join(' ') || 'Persona usuaria';
export const patientName = (data, item) => item?.patient_name || fullName(profileOf(data, item?.patient_id));
export const slotService = (data, slot) => slot?.specialty || serviceOf(data, slot?.service_id)?.name || 'Prestación';
export const slotProfessional = (data, slot) => slot?.professional || professionalOf(data, slot?.professional_id)?.full_name || 'Profesional';
export const slotDuration = slot => number(slot?.duration_minutes) || Math.round((new Date(slot?.ends_at) - new Date(slot?.starts_at)) / 60000);
export const APPOINTMENT_LABELS = {reserved: 'Por confirmar', confirmed: 'Confirmada', arrived: 'Llegada registrada', completed: 'Atendida', cancelled: 'Cancelada', no_show: 'Ausencia registrada'};
export const OFFER_LABELS = {pending: 'Pendiente de respuesta', accepted: 'Aceptada', declined: 'Rechazada', expired: 'Vencida', withdrawn: 'Retirada'};
export const ROOM_LABELS = {free: 'Libre', busy: 'En atención', transition: 'En transición', unavailable: 'No disponible'};
export const ROLE_LABELS = {patient: 'Paciente', reception: 'Recepción', admin: 'Administrador', supervisor: 'Supervisor'};
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const activeAppointment = appointment => ['reserved', 'confirmed', 'arrived', 'completed', 'no_show'].includes(appointment.status);
export function statusBadge(status, labels = APPOINTMENT_LABELS) {
  const tone = ['confirmed', 'completed', 'accepted', 'free'].includes(status) ? 'success'
    : ['reserved', 'pending', 'arrived', 'transition'].includes(status) ? 'warning'
      : ['cancelled', 'no_show', 'declined', 'expired', 'withdrawn', 'unavailable'].includes(status) ? 'danger' : 'neutral';
  return badge(labels[status] || status || 'Sin estado', tone);
}
export function effectiveOfferStatus(offer, now = new Date()) {
  return offer?.status === 'pending' && new Date(offer.expires_at).getTime() <= new Date(now).getTime() ? 'expired' : offer?.status;
}
export function options(list, {selected = '', label = item => item.name || item.full_name, emptyLabel = 'Todas las opciones', includeEmpty = true} = {}) {
  return `${includeEmpty ? `<option value="">${esc(emptyLabel)}</option>` : ''}${rows(list).map(item => `<option value="${esc(item.id)}" ${String(selected) === String(item.id) ? 'selected' : ''}>${esc(label(item))}</option>`).join('')}`;
}
export function closeButton() { return btn('Volver', 'close', '', 'secondary'); }
export function guardStaff(ctx) { if (!canOperate(ctx)) throw Error('Esta operación corresponde a recepción o administración.'); }
export function guardAdmin(ctx) { if (!canConfigure(ctx)) throw Error('Solo administración puede cambiar esta configuración.'); }
export function required(value, message) { if (value === undefined || value === null || String(value).trim() === '') throw Error(message); return String(value).trim(); }
export function boundedNumber(value, minimum, maximum, message) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw Error(message); return parsed; }
export function filterFields(ctx, {prefix = 'admin-filter', includeRange = true, includePeople = true} = {}) {
  const data = ctx.data, filters = ctx.filters || {}, from = filters.from || dayKey(nowDate(ctx));
  return `<div class="form-grid"><div class="field"><label for="${prefix}-from">${includeRange ? 'Desde' : 'Fecha'}</label><input id="${prefix}-from" type="date" name="from" required value="${esc(from)}"></div>${includeRange ? `<div class="field"><label for="${prefix}-to">Hasta</label><input id="${prefix}-to" type="date" name="to" required value="${esc(filters.to || from)}"></div>` : ''}<div class="field"><label for="${prefix}-service">Prestación</label><select id="${prefix}-service" name="service_id">${options(data.services, {selected: filters.service_id, emptyLabel: 'Todas las prestaciones'})}</select></div>${includePeople ? `<div class="field"><label for="${prefix}-professional">Profesional</label><select id="${prefix}-professional" name="professional_id">${options(data.professionals, {selected: filters.professional_id, emptyLabel: 'Todos los profesionales'})}</select></div><div class="field"><label for="${prefix}-room">Box</label><select id="${prefix}-room" name="room_id">${options(data.rooms, {selected: filters.room_id, emptyLabel: 'Todos los boxes'})}</select></div>` : ''}</div>`;
}
export function pagination(ctx) {
  const page = ctx.data.pagination || {}, offset = number(page.offset ?? ctx.filters?.offset), limit = Math.max(1, number(page.limit ?? ctx.filters?.limit ?? 100));
  if (!page.has_more && !offset) return '';
  return `<div class="toolbar" aria-label="Paginación"><p class="muted">Resultados desde ${integer(offset + 1)}${page.total ? ` de ${integer(page.total)}` : ''}. Los filtros se aplican en el servidor.</p><div class="actions">${offset ? btn('Página anterior', 'admin-page', String(Math.max(0, offset - limit)), 'secondary') : ''}${page.has_more ? btn('Página siguiente', 'admin-page', String(offset + limit), 'secondary') : ''}</div></div>`;
}
export function validateRange(values) {
  const from = required(values.from, 'Selecciona la fecha de inicio.'), to = required(values.to || values.from, 'Selecciona la fecha final.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw Error('Selecciona un rango de fechas válido.');
  if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 > 92) throw Error('Consulta hasta 93 días por vez para mantener una carga ágil.');
  return {from, to, service_id: values.service_id || '', professional_id: values.professional_id || '', room_id: values.room_id || '', offset: 0};
}
