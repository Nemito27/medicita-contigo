import {esc,icon,btn,badge,empty,dateLabel} from '../../components/ui.js';

export {esc,icon,btn,badge,empty,dateLabel};
export const rows=value=>Array.isArray(value)?value:[];
export const staff=ctx=>['admin','reception'].includes(ctx.role||ctx.data?.user?.role);
export const admin=ctx=>(ctx.role||ctx.data?.user?.role)==='admin';
export function requireStaff(ctx){if(!staff(ctx))throw Error('Esta acción corresponde al personal autorizado.');}
export function requireAdmin(ctx){if(!admin(ctx))throw Error('Solo administración puede revisar o moderar comentarios.');}
export const closeButton=()=>btn('Volver','close','','secondary');
export const privacyNotice=()=>'<p class="comm-privacy-notice">No compartas diagnósticos, datos personales ni información de otros pacientes.</p>';
export const statusLabels={published:'Publicado',pending:'Pendiente de revisión',hidden:'Oculto por moderación',withdrawn:'Retirado por su autor'};
export const callLabels={pending:'Esperando recepción',received:'Aviso recibido',understood:'Entendido por la persona',help:'Solicita ayuda'};
let identity='',cache=new Map(),requests=0;
export function clearCommunicationState(){identity='';cache.clear();requests++;}
export function featureState(ctx){
 const key=`${ctx.demo?'demo':'real'}:${ctx.data?.user?.id||'public'}:${ctx.sessionVersion?.()??0}`;
 if(identity!==key){identity=key;cache.clear();requests++;}
 return cache;
}
export function requestToken(ctx){featureState(ctx);return {identity,sequence:++requests,version:ctx.sessionVersion?.()};}
export function currentRequest(ctx,token){return token.identity===identity&&token.sequence===requests&&(token.version===undefined||token.version===ctx.sessionVersion?.());}
export function sameSession(ctx,version){return version===undefined||ctx.sessionVersion?.()===version;}
export function openDialogWith(selector){
 if(typeof document==='undefined')return true;
 return Boolean(document.querySelector('#modal')?.open&&document.querySelector(selector));
}
export function normalizedBody(value){return String(value||'').trim();}
export function validateBody(value){const body=normalizedBody(value);if(!body)throw Error('Escribe una observación antes de enviarla.');if(body.length>500)throw Error('Usa como máximo 500 caracteres.');return body;}
export function bodyField(value='',id='comm-comment-body'){
 return `<div class="field"><label for="${id}">Tu observación sobre la sala</label><textarea id="${id}" name="body" rows="4" required maxlength="500" aria-describedby="${id}-count ${id}-help" data-comm-body>${esc(value)}</textarea><div class="comm-editor-meta"><span id="${id}-count" data-comm-count>${String(value).length}/500 caracteres</span><span>Sin coronitas por comentar</span></div><p id="${id}-help" class="muted" data-comm-help>Escribe con respeto. El contenido se valida en el servidor antes de mostrarse.</p></div>`;
}
export function safeNumber(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
export function fieldReason(id,label='Motivo de la decisión',value='',{min=5,max=250}={}){
 return `<div class="field"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="reason" required minlength="${min}" maxlength="${max}" rows="3">${esc(value)}</textarea><small>Explica la razón sin incluir información clínica ni datos personales.</small></div>`;
}
