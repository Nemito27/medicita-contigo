export const TIME_ZONE = 'America/Santiago';
const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function parts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(partsFormatter.formatToParts(date).map(part => [part.type, part.value]));
}
export function dayKey(value = new Date()) {
  const p = parts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}
export function chileInput(value) {
  const p = parts(value);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : '';
}
export function dateLabel(value, options = {}) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Fecha por definir';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', ...options,
  }).format(date);
}
export function addDays(dateKey, amount) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw Error('Selecciona una fecha válida.');
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(amount));
  return date.toISOString().slice(0, 10);
}
// Compare both current Chilean offsets against IANA rules. Reject DST gaps and
// ambiguous local times rather than silently moving a medical appointment.
export function chileToIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) throw Error('Escribe una fecha y hora válidas para Chile.');
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  const candidates = [3, 4].map(offset => new Date(utc + offset * 3600000))
    .filter(date => chileInput(date) === value);
  if (candidates.length !== 1) {
    throw Error(candidates.length ? 'Esta hora se repite por el cambio de horario. Elige otro horario.' : 'Esta fecha u hora no existe en Chile. Revisa el cambio de horario.');
  }
  return candidates[0].toISOString();
}
