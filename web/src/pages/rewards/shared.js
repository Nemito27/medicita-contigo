import {esc,btn,badge,empty,dateLabel,icon} from '../../components/ui.js';

export {esc,btn,badge,empty,dateLabel,icon};
export const rows=value=>Array.isArray(value)?value:[];
export const role=ctx=>ctx.role||ctx.data?.user?.role||'patient';
export const isAdmin=ctx=>role(ctx)==='admin';
export const isStaff=ctx=>['admin','reception'].includes(role(ctx));
export const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export const integer=value=>number(value)===null?'—':new Intl.NumberFormat('es-CL',{maximumFractionDigits:0}).format(number(value));
export const fullName=person=>[person?.full_name,person?.last_name].filter(Boolean).join(' ')||'Persona registrada';
export const levelName=level=>typeof level==='string'?level:level?.name||'Nivel no disponible';
export const crown=()=>'<svg class="icon reward-crown" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Zm3 9h12"/></svg>';
export const SYMBOLIC_NOTICE='Las coronitas son un reconocimiento simbólico. No son dinero ni otorgan prioridad clínica, descuentos o acceso preferente a horas.';
export const AVATARS=Object.freeze({heart:['♡','Corazón'],crown:['♔','Corona'],leaf:['♧','Hoja'],sun:['☼','Sol'],star:['☆','Estrella'],flower:['✿','Flor'],contigo:['','Con Tigo']});
export function avatar(kind='contigo'){
  const [symbol,label]=AVATARS[kind]||AVATARS.contigo;
  return kind==='contigo'||!symbol?'<span class="reward-avatar"><img src="./assets/con-tigo.png" width="48" height="48" alt="Avatar Con Tigo"></span>':`<span class="reward-avatar" role="img" aria-label="Avatar ${label}">${symbol}</span>`;
}
export const actionLabels=Object.freeze({welcome:'Bienvenida',profile:'Perfil completo',confirmation:'Confirmación de una atención',attendance:'Asistencia validada',attendance_correction:'Corrección de asistencia',attendance_reversal:'Corrección de asistencia',attendance_restore:'Restablecimiento de asistencia',adjustment:'Ajuste administrativo',admin_adjustment:'Ajuste administrativo'});
export function movementLabel(item){return item.label||actionLabels[item.action]||'Movimiento de coronitas';}
export function movementAmount(amount){const n=number(amount);return n===null?'—':`${n>0?'+':''}${integer(n)}`;}
export function assertAdmin(ctx){if(!isAdmin(ctx))throw Error('Esta sección requiere permisos de administración.');}
export function assertStaff(ctx){if(!isStaff(ctx))throw Error('La corrección requiere personal autorizado.');}
export function reason(value){const result=String(value||'').trim();if(result.length<8||result.length>300)throw Error('Explica el motivo con entre 8 y 300 caracteres.');return result;}
export function requireId(value){const result=String(value||'').trim();if(!result||result.length>100)throw Error('No pudimos identificar el registro. Actualiza la sección.');return result;}
export function checked(value){return value?' checked':'';}
export function dialogActions(label='Volver'){return `<div class="actions">${btn(label,'reward-close','','secondary')}</div>`;}
export function stillCurrent(ctx,version,marker){
  if(typeof ctx.sessionVersion==='function'&&ctx.sessionVersion()!==version)return false;
  return typeof document==='undefined'||!marker||Boolean(document.getElementById(marker));
}
export function currentVersion(ctx){return typeof ctx.sessionVersion==='function'?ctx.sessionVersion():0;}
export function historyList(items,{correctable=false}={}){
  const values=rows(items);
  if(!values.length)return empty('Todavía no hay movimientos','Cada recompensa válida aparecerá aquí una sola vez, con su fecha y motivo.');
  return `<ol class="reward-history">${values.map(item=>{
    const amount=number(item.amount),appointment=item.appointment_id||item.reference?.appointment_id;
    return `<li class="reward-movement"><span class="reward-movement-amount ${amount!==null&&amount<0?'is-correction':''}">${crown()}${esc(movementAmount(item.amount))}</span><div><strong>${esc(movementLabel(item))}</strong><time datetime="${esc(item.created_at||'')}">${esc(dateLabel(item.created_at))}</time>${item.reason?`<p>${esc(item.reason)}</p>`:''}${correctable&&item.correctable&&appointment?`<div class="actions">${btn('Corregir asistencia registrada','reward-correct-attendance',appointment,'ghost')}</div>`:''}</div></li>`;
  }).join('')}</ol>`;
}
