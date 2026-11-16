export const appointmentLabels = Object.freeze({reserved:'Por confirmar',confirmed:'Confirmada',arrived:'Llegada registrada',completed:'Atendida',cancelled:'Cancelada',no_show:'Ausencia registrada'});
export const roomLabels = Object.freeze({free:'Libre',busy:'En atención',transition:'En transición',unavailable:'No disponible'});
export const roleLabels = Object.freeze({patient:'Paciente',reception:'Recepción',admin:'Administración',supervisor:'Supervisión'});
export function errorMessage(error) {
  if (!navigator.onLine) return 'No hay conexión. Tu operación no se ha confirmado. Conéctate y vuelve a intentarlo.';
  const text = String(error?.message || 'No pudimos completar esta operación. Vuelve a intentarlo.');
  if (/JWT|session|refresh token|not authenticated|iniciar sesi[oó]n/i.test(text)) return 'Necesitas volver a ingresar para continuar.';
  if (/fetch|network|Failed to fetch/i.test(text)) return 'No pudimos conectarnos. Tu operación no se ha confirmado; revisa el estado antes de reintentar.';
  return text.length > 260 ? 'No pudimos completar la operación. Revisa los datos e inténtalo nuevamente.' : text;
}
export function formValues(form) {
  const result = {};
  for (const [key, value] of new FormData(form)) {
    if (Object.hasOwn(result, key)) result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    else result[key] = value;
  }
  return result;
}
