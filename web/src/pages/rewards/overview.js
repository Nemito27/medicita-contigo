import {esc,btn,badge,empty,dateLabel,crown,integer,number,levelName,rows,historyList,SYMBOLIC_NOTICE} from './shared.js';

function progressMarkup(rewards,prefix='reward'){
  const next=rewards.next_level,percent=number(rewards.progress?.percent);
  if(!next)return `<div class="reward-progress"><strong>Estás en ${esc(levelName(rewards.level))}.</strong><p>Tu reconocimiento no cambia tu acceso a la atención.</p></div>`;
  const value=percent===null?0:Math.max(0,Math.min(100,percent));
  return `<div class="reward-progress"><div class="reward-progress-label"><label for="${prefix}-progress">Próximo galardón: <strong>${esc(levelName(next))}</strong></label><span>${integer(rewards.balance)} de ${integer(next.threshold)}</span></div><progress id="${prefix}-progress" max="100" value="${value}" aria-label="Progreso hacia ${esc(levelName(next))}">${Math.round(value)}%</progress><p class="muted">Se desbloquea al alcanzar ${integer(next.threshold)} coronitas; no se descuentan de tu saldo.</p></div>`;
}

export function renderRewardSummary(ctx){
  const rewards=ctx.data?.rewards;
  if(!rewards)return `<section class="card reward-summary"><div><h2>${crown()} Mis coronitas</h2><p class="muted">El saldo no está disponible en este momento.</p></div>${btn('Volver a consultar','reward-refresh','','secondary')}</section>`;
  return `<section class="card reward-summary" aria-labelledby="reward-summary-title"><div><p class="eyebrow">UN RECONOCIMIENTO CON TIGO</p><h2 id="reward-summary-title" data-reward-balance="${esc(rewards.balance??'')}">${crown()} ${integer(rewards.balance)} coronitas</h2><p>${esc(levelName(rewards.level))} · Reconocimiento simbólico, sin beneficios clínicos.</p></div><div class="actions">${btn('Ver misiones y galardones','reward-open','','secondary')}</div></section>`;
}

function missionCards(missions){
  const list=rows(missions);
  if(!list.length)return empty('Las misiones no están disponibles','Actualiza para consultar el progreso registrado en tu cuenta.');
  return `<div class="reward-missions">${list.map((mission,index)=>{
    const progress=number(mission.progress),target=number(mission.target),complete=mission.completed===true;
    const percent=progress!==null&&target>0?Math.max(0,Math.min(100,progress/target*100)):0;
    const state=complete?'Completada':progress>0?'En progreso':'Disponible';
    return `<article class="reward-mission ${complete?'is-complete':''}" data-mission-key="${esc(mission.key||'')}" data-mission-progress="${esc(progress??'')}" data-mission-target="${esc(target??'')}"><div class="section-title"><h3>${esc(mission.title||'Misión Con Tigo')}</h3>${badge(state,complete?'success':'neutral')}</div><p class="reward-mission-progress">${integer(progress)} de ${integer(target)}</p><progress id="reward-mission-${index}" value="${percent}" max="100" aria-label="Progreso de ${esc(mission.title||'la misión')}">${Math.round(percent)}%</progress><p class="muted">${complete?'Galardón conseguido.':'El progreso se actualiza con los eventos validados del sistema.'}</p></article>`;
  }).join('')}</div>`;
}

function awardCards(awards){
  const list=rows(awards);
  if(!list.length)return empty('Todavía no podemos cargar tu colección','No se mostrarán galardones inventados. Actualiza esta sección para reintentar.');
  return `<div class="reward-awards">${list.map(award=>{
    const earned=award.earned===true&&award.active!==false;
    const corrected=award.earned===true&&award.active===false;
    return `<article class="reward-award ${earned?'is-earned':corrected?'is-corrected':'is-pending'}"><span class="reward-award-mark">${crown()}</span><h3>${esc(award.name||'Galardón')}</h3>${badge(earned?'Obtenido':corrected?'Pendiente tras corrección':'Pendiente',earned?'success':corrected?'warning':'neutral')}<p>${esc(award.description||'Reconocimiento digital Con Tigo.')}</p>${number(award.threshold)!==null?`<p class="muted">Desde ${integer(award.threshold)} coronitas.</p>`:''}${earned&&award.earned_at?`<small>Obtenido: ${esc(dateLabel(award.earned_at))}</small>`:''}</article>`;
  }).join('')}</div>`;
}

function rulesList(rules){
  const values=rows(rules);
  return values.length?`<ul class="reward-rules">${values.map(rule=>`<li><span>${esc(rule.label||'Acción validada')}</span><strong>${crown()} +${integer(rule.amount)}</strong></li>`).join('')}</ul>`:empty('Las reglas no están disponibles','La aplicación necesita consultar la configuración del servidor.');
}

export function renderOverview(ctx){
  const rewards=ctx.data?.rewards;
  if(!rewards)return `<div class="page-header"><div><p class="eyebrow">RECONOCIMIENTOS SIMBÓLICOS</p><h1>Mis coronitas</h1></div></div><section class="card">${empty('No pudimos cargar tus coronitas','Tus reservas siguen disponibles. Reintenta consultar el saldo y los movimientos.',btn('Actualizar','reward-refresh','','secondary'))}</section>`;
  return `<div class="page-header"><div><p class="eyebrow">RECONOCIMIENTOS SIMBÓLICOS</p><h1>Mis coronitas</h1><p class="muted">Tus misiones y galardones digitales, con un progreso que puedes revisar.</p></div>${ctx.demo?badge('Datos ficticios de demostración','warning'):badge('Tu cuenta personal','neutral')}</div><div class="grid grid-2"><section class="card reward-balance-card"><p class="eyebrow">TU SALDO</p><div class="reward-balance" data-reward-balance="${esc(rewards.balance??'')}">${crown()}<strong>${integer(rewards.balance)}</strong><span>coronitas</span></div><p class="reward-level" data-reward-level="${esc(rewards.level?.id||'')}">${esc(levelName(rewards.level))}</p>${progressMarkup(rewards)}<div class="actions">${btn('Comunidad de coronitas','reward-open-community','','secondary')}</div></section><section class="card stack"><h2>Cómo ganar coronitas</h2>${rulesList(rewards.rules)}<p>La confirmación se premia una vez por el mismo proceso de atención, aunque cambies la hora. La asistencia se acredita cuando el personal autorizado valida que la atención se realizó.</p><div class="notice">${SYMBOLIC_NOTICE}</div><p class="muted">No hay premios por reservar, cancelar o comentar, ni penalizaciones por enfermedad, discapacidad o ausencia. No necesitas solicitar atenciones para completar una misión.</p></section></div><section class="card stack"><div class="section-title"><div><p class="eyebrow">PASOS QUE PUEDES RECONOCER</p><h2>Misiones Con Tigo</h2></div><p class="muted">Asistencias validadas: ${integer(rewards.validated_attendances)}</p></div>${missionCards(rewards.missions)}<p class="muted">Las misiones entregan galardones. No agregan coronitas extra a las reglas indicadas arriba y no exigen asistir todas las semanas.</p></section><section class="card stack"><div class="section-title"><h2>Mi colección de galardones</h2><span class="muted">Se entregan una sola vez y no consumen tu saldo.</span></div>${awardCards(rewards.awards)}</section><section class="card stack"><div class="section-title"><h2>Historial de coronitas</h2>${btn('Ver todos los movimientos','reward-own-history','','secondary')}</div>${historyList(rows(rewards.history).slice(0,10))}<p class="muted">Las correcciones se registran como nuevos movimientos; el historial original se conserva.</p></section>`;
}
