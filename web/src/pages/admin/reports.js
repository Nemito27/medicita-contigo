import {esc, icon, btn, badge, empty, integer, percent, number, rows, nowDate, dayKey, addDays, labelDay, filterFields, isSupervisor} from './common.js';

const definitions = {
  occupancy: 'Horas con reserva activa ÷ horas de la agenda filtrada. No equivale a asistencia real.',
  absence: 'Ausencias registradas ÷ (atenciones completadas + ausencias registradas) de citas elegibles. Excluye reservas futuras.',
  early: 'Cancelaciones informadas con la anticipación configurada ÷ cancelaciones del período.',
  recovered: 'Cupos liberados que terminaron atendiendo a otra persona. Una oferta aceptada por sí sola todavía no cuenta como recuperada.',
};
const scalar = (report, key) => number(report?.[key]);

export function renderMetrics(ctx, compact = false) {
  const report = ctx.data.report;
  if (!report) return `<section class="card">${empty('Todavía no hay un informe disponible', 'Actualiza la página o selecciona otro período.')}</section>`;
  const metrics = compact ? [
    ['Horas creadas', integer(report.total_slots), 'Agenda del período'],
    ['Con reserva', integer(scalar(report, 'reserved') + scalar(report, 'confirmed') + scalar(report, 'arrived')), 'Reservadas, confirmadas y llegadas'],
    ['Cupos liberados', integer(report.released_slots), 'Cancelaciones que generaron disponibilidad'],
    ['Cupos recuperados', integer(report.recovered_slots), 'Atendidos por otra persona'],
  ] : [
    ['Horas creadas', integer(report.total_slots), 'Cupos registrados para el período'],
    ['Horas disponibles', integer(report.available_slots), 'Cupos abiertos según la agenda'],
    ['Por confirmar', integer(report.reserved), 'Reserva sin confirmación del paciente'],
    ['Confirmadas', integer(report.confirmed), 'Intención de asistencia confirmada'],
    ['Llegadas', integer(report.arrived), 'Ingreso validado por recepción'],
    ['Atendidas', integer(report.completed), 'Atenciones completadas'],
    ['Cancelaciones', integer(report.cancelled), 'Reservas canceladas'],
    ['Ausencias', integer(report.no_show), 'Registradas por personal autorizado'],
    ['Cupos liberados', integer(report.released_slots), 'Liberaciones de reserva'],
    ['Nuevas asignaciones', integer(report.reassigned_slots), 'Aceptaciones; no equivalen a atención'],
    ['Cupos recuperados', integer(report.recovered_slots), 'Liberados y atendidos por otra persona'],
    ['Ofertas pendientes', integer(report.pending_offers), 'Aún esperan respuesta'],
    ['Personas en espera', integer(report.waiting_people), 'Personas, sin duplicar solicitudes'],
  ];
  return `<div class="metrics-grid">${metrics.map(([title, value, detail]) => `<article class="kpi"><span>${esc(title)}</span><strong>${esc(value)}</strong><small class="stat-detail">${esc(detail)}</small></article>`).join('')}</div>`;
}

function barChart(report) {
  const entries = [['Enviadas', scalar(report, 'offers_sent'), '#155D45'], ['Aceptadas', scalar(report, 'offers_accepted'), '#328166'], ['Rechazadas', scalar(report, 'offers_declined'), '#B45D39'], ['Vencidas', scalar(report, 'offers_expired'), '#8D6B1F']];
  const max = Math.max(...entries.map(([, amount]) => amount), 1);
  return `<div class="chart-bars bars" role="img" aria-label="Ofertas: ${entries.map(([label, amount]) => `${label} ${integer(amount)}`).join(', ')}">${entries.map(([label, amount, color]) => `<div class="bar-row"><div class="toolbar"><span>${esc(label)}</span><strong>${integer(amount)}</strong></div><div class="progress-track"><span class="progress-fill" style="width:${Math.round(amount / max * 100)}%;background:${color}"></span></div></div>`).join('')}</div>`;
}

function lineChart(report) {
  const daily = rows(report.daily);
  if (!daily.length) return empty('Sin registros diarios en este período', 'Los resultados aparecerán al comenzar a usar la agenda.');
  const max = Math.max(...daily.map(day => scalar(day, 'completed')), ...daily.map(day => scalar(day, 'cancelled')), 1);
  const point = (item, index, key) => `${24 + index * (592 / Math.max(daily.length - 1, 1))},${154 - scalar(item, key) / max * 124}`;
  const completed = daily.map((item, index) => point(item, index, 'completed')).join(' ');
  const cancelled = daily.map((item, index) => point(item, index, 'cancelled')).join(' ');
  return `<svg class="chart-line" viewBox="0 0 640 180" role="img" aria-label="Evolución diaria de atenciones y cancelaciones"><title>Atenciones y cancelaciones por día</title><path d="M24 24V154H616" fill="none" stroke="#BFCDBF" stroke-width="1"/><polyline points="${completed}" fill="none" stroke="#155D45" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${cancelled}" fill="none" stroke="#A24B2D" stroke-width="3" stroke-dasharray="7 5"/>${daily.map((item, index) => `<circle cx="${point(item, index, 'completed').split(',')[0]}" cy="${point(item, index, 'completed').split(',')[1]}" r="3" fill="#155D45"><title>${esc(labelDay(item.date))}: ${integer(item.completed)} atenciones</title></circle>`).join('')}</svg><div class="toolbar chart-legend"><span>● Atenciones completadas</span><span>− − Cancelaciones</span></div><p class="muted">${esc(labelDay(daily[0].date))} al ${esc(labelDay(daily.at(-1).date))}. Los valores exactos están en la tabla siguiente.</p>`;
}

export function renderDashboard(ctx) {
  const report = ctx.data.report || {}, user = ctx.data.user;
  return `<section class="hero admin-hero"><div><p class="eyebrow">GESTIÓN DE OPORTUNIDADES</p><h2>Cada cupo puede ayudar a alguien.</h2><p>Coordina la jornada, revisa cancelaciones y ofrece los cupos a personas compatibles.</p><div class="actions">${btn('Abrir agenda', 'admin-open-calendar')}${btn('Revisar lista de espera', 'admin-open-waiting', '', 'secondary')}</div></div><div class="hero-stat"><span>Cupos recuperados</span><strong>${integer(report.recovered_slots)}</strong><small>Atendidos por otra persona</small></div></section>${renderMetrics(ctx, true)}<form id="admin-report-filters" class="card stack"><div class="section-title"><h2>Período de análisis</h2>${badge('Horarios de Chile')}</div>${filterFields(ctx, {prefix: 'admin-dashboard', includePeople: false})}<div class="actions"><button class="btn btn-secondary" type="submit">Aplicar período</button>${btn('Hoy', 'admin-period', 'today', 'ghost')}${btn('Últimos 7 días', 'admin-period', 'week', 'ghost')}${btn('Este mes', 'admin-period', 'month', 'ghost')}</div></form><div class="grid grid-2"><section class="card chart-card"><h2>Seguimiento de ofertas</h2>${barChart(report)}<p class="muted">Las ofertas reservan temporalmente el cupo hasta una respuesta o su vencimiento.</p></section><section class="card"><h2>Prioridades de esta vista</h2><ul class="check-list"><li><strong>${integer(report.reserved)}</strong> reservas por confirmar.</li><li><strong>${integer(report.pending_offers)}</strong> ofertas pendientes de respuesta.</li><li><strong>${integer(report.waiting_people)}</strong> personas en lista de espera.</li></ul><div class="notice"><strong>Ocupación no es asistencia.</strong><p>Reservar, llegar y finalizar una atención son estados diferentes.</p></div>${btn('Ver informe completo', 'admin-open-reports', '', 'secondary')}</section></div>`;
}

export function renderReports(ctx) {
  const report = ctx.data.report || {}, daily = rows(report.daily);
  return `<section class="card stack"><div class="section-title"><div><p class="eyebrow">${isSupervisor(ctx) ? 'VISTA AGREGADA DE SUPERVISIÓN' : 'INDICADORES DEL SISTEMA INDEPENDIENTE'}</p><h2>Menos horas perdidas, más oportunidades</h2></div><div class="actions">${btn('Descargar CSV', 'admin-export-report', '', 'secondary')}${btn('Imprimir / guardar PDF', 'admin-print-report', '', 'ghost')}</div></div><form id="admin-report-filters">${filterFields(ctx, {prefix: 'admin-report', includePeople: false})}<div class="actions"><button class="btn btn-primary" type="submit">Actualizar informe</button>${btn('Últimos 7 días', 'admin-period', 'week', 'ghost')}${btn('Este mes', 'admin-period', 'month', 'ghost')}</div></form><p class="muted">Todos los valores son del período y la prestación seleccionados. Los reportes descargados contienen datos agregados, sin nombres de pacientes.</p></section><div class="report-print">${renderMetrics(ctx)}<div class="grid grid-2"><section class="card"><h2>Ocupación de agenda</h2><p class="big-number">${percent(report.occupancy_rate)}</p><p>${esc(definitions.occupancy)}</p></section><section class="card"><h2>Tasa de inasistencia</h2><p class="big-number">${percent(report.no_show_rate)}</p><p>${esc(definitions.absence)}</p></section><section class="card"><h2>Cancelación anticipada</h2><p class="big-number">${percent(report.early_cancellation_rate)}</p><p>${esc(definitions.early)}</p></section><section class="card"><h2>Tiempo de nueva asignación</h2><p class="big-number">${report.average_recovery_minutes === null || report.average_recovery_minutes === undefined ? '—' : `${integer(report.average_recovery_minutes)} min`}</p><p>Promedio entre la liberación y su nueva asignación. La atención efectiva se informa aparte como cupo recuperado.</p></section></div><div class="grid grid-2"><section class="card chart-card"><h2>Actividad por día</h2>${lineChart(report)}</section><section class="card chart-card"><h2>Resultado de las ofertas</h2>${barChart(report)}<div class="notice">${esc(definitions.recovered)}</div></section></div><section class="card"><h2>Detalle diario agregado</h2>${daily.length ? `<div class="table-wrap"><table class="data-table"><caption class="sr-only">Agenda, atenciones y cancelaciones por fecha</caption><thead><tr><th>Fecha</th><th>Horas</th><th>Con reserva</th><th>Atendidas</th><th>Canceladas</th><th>Ausencias</th><th>Recuperadas</th></tr></thead><tbody>${daily.map(item => `<tr><th scope="row">${esc(labelDay(item.date))}</th><td>${integer(item.total)}</td><td>${integer(item.reserved)}</td><td>${integer(item.completed)}</td><td>${integer(item.cancelled)}</td><td>${integer(item.no_show)}</td><td>${integer(item.recovered)}</td></tr>`).join('')}</tbody></table></div>` : empty('No hay actividad en el período', 'Cambia los filtros o comienza a registrar las atenciones.')}<p class="muted">Las métricas describen Medicita Contigo. No representan resultados oficiales de un CESFAM.</p></section></div>`;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadCsv(filename, lines) {
  const blob = new Blob(['\uFEFF', lines.map(line => line.map(csvCell).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportReport(ctx) {
  const report = ctx.data.report;
  if (!report) throw Error('Actualiza el informe antes de descargarlo.');
  const data = [['Medicita Contigo — reporte agregado del sistema independiente'], ['Datos de demostración', ctx.demo ? 'Sí: completamente ficticios' : 'No'], ['Desde', ctx.filters.from], ['Hasta', ctx.filters.to], [], ['Indicador', 'Valor']];
  const fields = {total_slots: 'Horas creadas', available_slots: 'Horas disponibles', reserved: 'Por confirmar', confirmed: 'Confirmadas', arrived: 'Llegadas', completed: 'Atendidas', cancelled: 'Cancelaciones', no_show: 'Ausencias', released_slots: 'Cupos liberados', reassigned_slots: 'Nuevas asignaciones', recovered_slots: 'Cupos recuperados y atendidos', pending_offers: 'Ofertas pendientes', waiting_people: 'Personas en espera', occupancy_rate: 'Ocupación (%)', no_show_rate: 'Inasistencia (%)', early_cancellation_rate: 'Cancelación anticipada (%)', average_recovery_minutes: 'Tiempo promedio de nueva asignación (min)', offers_sent: 'Ofertas enviadas', offers_accepted: 'Ofertas aceptadas', offers_declined: 'Ofertas rechazadas', offers_expired: 'Ofertas vencidas'};
  for (const [key, label] of Object.entries(fields)) data.push([label, report[key] ?? '']);
  data.push([], ['Fecha', 'Horas', 'Con reserva', 'Atendidas', 'Canceladas', 'Ausencias', 'Recuperadas']);
  for (const item of rows(report.daily)) data.push([item.date, number(item.total), number(item.reserved), number(item.completed), number(item.cancelled), number(item.no_show), number(item.recovered)]);
  data.push([], ['Definición de cupo recuperado', definitions.recovered], ['Definición de inasistencia', definitions.absence], ['Ocupación y asistencia', 'Son indicadores diferentes.']);
  downloadCsv(`medicita-contigo-${ctx.filters.from}-${ctx.filters.to}.csv`, data);
}

export async function handleReportAction(ctx, action, id) {
  if (action === 'admin-export-report') { exportReport(ctx); return true; }
  if (action === 'admin-print-report') { ctx.navigate('reports'); requestAnimationFrame(() => window.print()); return true; }
  if (action === 'admin-period') {
    const today = dayKey(nowDate(ctx)), from = id === 'week' ? addDays(today, -6) : id === 'month' ? `${today.slice(0, 7)}-01` : today;
    await ctx.refresh({from, to: today, offset: 0}); return true;
  }
  return false;
}
