import {esc,btn,badge,dateLabel,dayKey} from '../../components/ui.js';

export const appointmentLabels={reserved:'Por confirmar',confirmed:'Confirmada',arrived:'Llegada registrada',completed:'Atención realizada',cancelled:'Cancelada',no_show:'Ausencia registrada'};
export const offerLabels={pending:'Pendiente de respuesta',accepted:'Aceptada',declined:'Rechazada',expired:'Vencida',withdrawn:'Retirada por el centro'};
export const roomLabels={free:'Libre',busy:'En atención',transition:'En transición',unavailable:'No disponible'};
export const nowFor=ctx=>new Date(typeof ctx?.now==='function'?ctx.now():Date.now());
export const array=(data,key)=>Array.isArray(data?.[key])?data[key]:[];
export const slotFor=(ctx,id)=>array(ctx.data,'slots').find(s=>String(s.id)===String(id))||array(ctx.data,'available').find(s=>String(s.id)===String(id));
export const ownAppointments=ctx=>array(ctx.data,'appointments').filter(a=>String(a.patient_id)===String(ctx.data.user.id)).sort((a,b)=>new Date(slotFor(ctx,a.slot_id)?.starts_at||0)-new Date(slotFor(ctx,b.slot_id)?.starts_at||0));
export const ownAppointment=(ctx,id)=>ownAppointments(ctx).find(a=>String(a.id)===String(id));
export const ownWaiting=ctx=>array(ctx.data,'waiting').filter(w=>String(w.patient_id)===String(ctx.data.user.id));
export const ownOffers=ctx=>array(ctx.data,'offers').filter(o=>String(o.patient_id)===String(ctx.data.user.id));
export const activeOffer=(o,ctx)=>o.status==='pending'&&new Date(o.expires_at)>nowFor(ctx);
export const upcomingAppointments=ctx=>ownAppointments(ctx).filter(a=>['reserved','confirmed','arrived'].includes(a.status)&&new Date(slotFor(ctx,a.slot_id)?.ends_at||slotFor(ctx,a.slot_id)?.starts_at)>nowFor(ctx));
export const editableAppointment=(ctx,a)=>a&&['reserved','confirmed'].includes(a.status)&&new Date(slotFor(ctx,a.slot_id)?.starts_at)>new Date(nowFor(ctx).getTime()+Number(ctx.data.settings?.cancellation_notice_minutes||0)*60000);
export const serviceFor=(ctx,id)=>array(ctx.data,'services').find(s=>String(s.id)===String(id));
export function statusBadge(status){return badge(appointmentLabels[status]||status,{reserved:'warning',confirmed:'success',arrived:'success',completed:'neutral',cancelled:'neutral',no_show:'warning'}[status]||'neutral');}
export function slotDetails(ctx,s,{heading=true}={}){
 if(!s)return '<p class="muted">Los detalles de esta hora no están disponibles. Actualiza la información.</p>';
 const professional=s.professional||array(ctx.data,'professionals').find(p=>String(p.id)===String(s.professional_id))?.full_name||'Profesional por informar';
 const service=s.specialty||serviceFor(ctx,s.service_id)?.name||'Atención';
 const room=array(ctx.data,'rooms').find(r=>String(r.id)===String(s.room_id));
 return `${heading?`<h3>${esc(service)}</h3>`:''}<p class="appointment-date">${esc(dateLabel(s.starts_at))}</p><dl class="appointment-meta"><div><dt>Profesional</dt><dd>${esc(professional)}</dd></div><div><dt>Centro</dt><dd>${esc(ctx.data.center?.name||'Centro independiente Medicita Contigo')}</dd></div><div><dt>Dirección</dt><dd>${esc(ctx.data.center?.address||'Pendiente de informar por el centro')}</dd></div><div><dt>Box</dt><dd>${esc(room?.name||'Por informar')}</dd></div><div><dt>Duración</dt><dd>${esc(s.duration_minutes||serviceFor(ctx,s.service_id)?.duration_minutes||'—')} minutos</dd></div></dl>`;
}
export function appointmentCard(ctx,a,{prominent=false}={}){
 const s=slotFor(ctx,a.slot_id),canEdit=editableAppointment(ctx,a),canConfirm=a.status==='reserved'&&new Date(s?.starts_at)>nowFor(ctx);
 const qr=['reserved','confirmed'].includes(a.status)&&s&&dayKey(s.starts_at)>=dayKey(nowFor(ctx));
 return `<article class="card appointment-card ${prominent?'next-appointment':''}"><div class="status-row">${statusBadge(a.status)}${prominent?'<span class="eyebrow">TU PRÓXIMA HORA</span>':''}</div>${slotDetails(ctx,s)}<div class="actions">${canConfirm?btn('Confirmar asistencia','patient-confirm',a.id):''}${canEdit?btn('No podré asistir','patient-not-attend',a.id,'danger')+btn('Cambiar hora','patient-change',a.id,'secondary'):''}${btn('Ver detalles','patient-details',a.id,'ghost')}${qr?btn('Mi QR','patient-qr',a.id,'ghost'):''}</div>${['reserved','confirmed'].includes(a.status)&&!canEdit?'<p class="muted">El plazo para modificar esta reserva terminó. Solicita ayuda al equipo del centro.</p>':''}</article>`;
}
export const backButton=()=>btn('Volver','patient-close','','secondary');
export const hidden=(name,value)=>`<input type="hidden" name="${esc(name)}" value="${esc(value||'')}">`;
export const submit=(label,variant='primary')=>`<button class="btn btn-${esc(variant)}" type="submit">${esc(label)}</button>`;
export function checked(value){return value?' checked':'';}
