import {empty, rows, role, canOperate, canConfigure, guardStaff, guardAdmin, validateRange, number} from './admin/common.js';
import {renderDashboard, renderReports, handleReportAction} from './admin/reports.js';
import {renderCalendar, handleCalendarAction, handleCalendarSubmit, stopAdminScanner} from './admin/calendar.js';
import {renderWaiting, renderCancellations, renderHistory, renderPatients, handleRecoveryAction, handleRecoverySubmit} from './admin/recovery.js';
import {renderRooms, renderResources, handleResourceAction, handleResourceSubmit, chooseResourceKind} from './admin/resources.js';

export {stopAdminScanner};

const navigationActions = {
  'admin-open-calendar': 'calendar', 'admin-open-waiting': 'waiting',
  'admin-open-resources': 'resources', 'admin-open-reports': 'reports',
};

export function renderAdmin(page, ctx) {
  const currentRole = role(ctx);
  if (!['admin', 'reception', 'supervisor'].includes(currentRole)) return empty('Acceso restringido', 'Esta cuenta no tiene permisos de administración.');
  if (currentRole === 'supervisor' && !['reports', 'history'].includes(page)) return empty('Vista reservada al equipo de atención', 'Tu cuenta de supervisión dispone de indicadores agregados y auditoría sin datos de pacientes.');
  const pages = {
    dashboard: renderDashboard, calendar: renderCalendar, waiting: renderWaiting,
    cancellations: renderCancellations, rooms: renderRooms, resources: renderResources,
    patients: renderPatients, reports: renderReports, history: renderHistory,
  };
  return pages[page] ? pages[page](ctx) : empty('Vista no disponible', 'Selecciona una sección del menú.');
}

export async function handleAdminAction(ctx, action, id = '') {
  if (!String(action).startsWith('admin-')) return false;
  if (!['admin', 'reception', 'supervisor'].includes(role(ctx))) throw Error('Esta cuenta no tiene acceso al panel de personal.');
  if (Object.hasOwn(navigationActions, action)) {
    const page = navigationActions[action];
    if (page === 'resources') { guardAdmin(ctx); chooseResourceKind(id); }
    else if (page !== 'reports') guardStaff(ctx);
    stopAdminScanner(); ctx.close(); ctx.navigate(page); return true;
  }
  if (action === 'admin-page') {
    const offset = number(id);
    if (!Number.isInteger(offset) || offset < 0) throw Error('La página solicitada no es válida.');
    await ctx.refresh({offset}); return true;
  }
  if (await handleReportAction(ctx, action, id)) return true;
  if (await handleCalendarAction(ctx, action, id)) return true;
  if (await handleRecoveryAction(ctx, action, id)) return true;
  if (await handleResourceAction(ctx, action, id)) return true;
  return false;
}

export async function handleAdminSubmit(ctx, formId, values, form) {
  if (!String(formId).startsWith('admin-')) return false;
  if (!['admin', 'reception', 'supervisor'].includes(role(ctx))) throw Error('Esta cuenta no tiene acceso al panel de personal.');
  if (formId === 'admin-report-filters') { await ctx.refresh(validateRange(values)); return true; }
  if (await handleCalendarSubmit(ctx, formId, values, form)) return true;
  if (await handleRecoverySubmit(ctx, formId, values, form)) return true;
  if (await handleResourceSubmit(ctx, formId, values, form)) return true;
  return false;
}
