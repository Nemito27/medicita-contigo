import {esc,btn,badge,empty,rows,integer,levelName,avatar,AVATARS,checked,crown,SYMBOLIC_NOTICE} from './shared.js';

export function renderCommunityPreferences(ctx){
  const prefs=ctx.data?.rewards?.community||{};
  return `<section class="card stack reward-community-preferences"><div><p class="eyebrow">TU DECISIÓN</p><h2>Participar en la comunidad</h2></div><form id="reward-community-preferences" class="stack"><label class="checkbox-field"><input type="checkbox" name="opt_in" value="yes"${checked(prefs.opt_in===true)}>Permitir que otras personas vean mi alias, avatar y coronitas.</label><div class="form-grid"><div class="field"><label for="reward-community-alias">Alias de presentación</label><input id="reward-community-alias" name="alias" minlength="2" maxlength="24" value="${esc(prefs.alias||'')}" autocomplete="nickname" placeholder="Por ejemplo, SolVerde" aria-describedby="reward-community-alias-help"><small id="reward-community-alias-help">Usa entre 2 y 24 caracteres, sin correos, teléfonos ni enlaces. No incluyas datos de atención.</small></div><div class="field"><label for="reward-community-avatar">Avatar</label><select id="reward-community-avatar" name="avatar">${Object.entries(AVATARS).map(([id,[,label]])=>`<option value="${id}" ${(prefs.avatar||'contigo')===id?'selected':''}>${esc(label)}</option>`).join('')}</select></div></div><p class="muted">Puedes dejar de participar cuando quieras. Tu saldo personal seguirá disponible; no se publican tus contactos, citas, tratamientos ni historial de movimientos.</p><button class="btn btn-primary" type="submit">Guardar participación</button></form></section>`;
}

export function renderCommunity(ctx){
  const rewards=ctx.data?.rewards,community=ctx.data?.community;
  const list=Array.isArray(community)?community:rows(community?.items);
  const ownBalance=rewards?integer(rewards.balance):'—';
  const offset=Number(ctx.filters?.community_offset||0),limit=25;
  return `<div class="page-header"><div><p class="eyebrow">RECONOCIMIENTO SIN COMPETIR POR LA ATENCIÓN</p><h1>Comunidad de coronitas</h1><p class="muted">Compartir tu reconocimiento es opcional y no cambia la asignación de horas.</p></div>${ctx.demo?badge('Datos ficticios de demostración','warning'):''}</div><section class="card reward-community-own"><div><strong data-reward-balance="${esc(rewards?.balance??'')}">${crown()} Tu saldo: ${ownBalance} coronitas</strong><p class="muted">Siempre puedes ver tus coronitas, participes o no en la comunidad.</p></div>${btn('Mis misiones y galardones','reward-open','','secondary')}</section><section class="card stack"><div class="section-title"><h2>Personas que eligieron compartir</h2>${community&&!Array.isArray(community)?badge(`${integer(community.total)} participantes`):''}</div>${!community?empty('No pudimos consultar la comunidad','Actualiza para volver a intentar.',btn('Actualizar','reward-refresh','','secondary')):list.length?`<div class="reward-community-grid">${list.map(person=>`<article class="reward-community-person">${avatar(person.avatar)}<div><h3>${esc(person.alias||'Participante')}</h3>${person.is_self?badge('Tu alias','success'):''}<p>${crown()} <strong>${integer(person.balance)} coronitas</strong></p><small>${esc(levelName(person.level))}</small></div></article>`).join('')}</div>`:empty('Aún no hay participantes para mostrar','Cada persona decide si quiere compartir su alias y sus coronitas.')}<div class="actions">${offset>0?btn('Anterior','reward-community-page',Math.max(0,offset-limit),'secondary'):''}${community?.has_more?btn('Siguiente','reward-community-page',offset+limit,'secondary'):''}</div><div class="notice">${SYMBOLIC_NOTICE}</div></section>${renderCommunityPreferences(ctx)}`;
}

export async function communityAction(ctx,action,id){
  if(action!=='reward-community-page')return false;
  const offset=Number(id);
  if(!Number.isInteger(offset)||offset<0)throw Error('La página solicitada no es válida.');
  await ctx.refresh({community_offset:offset});return true;
}

export async function communitySubmit(ctx,formId,values){
  if(formId!=='reward-community-preferences')return false;
  const optIn=values.opt_in==='yes'||values.opt_in==='on'||values.opt_in===true;
  const alias=String(values.alias||'').trim(),selectedAvatar=String(values.avatar||'contigo');
  if((optIn&&alias.length<2)||alias.length>24)throw Error('El alias debe tener entre 2 y 24 caracteres cuando participas.');
  if(alias&&(!/^[\p{L}\p{N} _-]+$/u.test(alias)||/\d{6,}|https?|www/i.test(alias)))throw Error('Elige un alias sin correo, teléfono ni enlaces.');
  if(!Object.hasOwn(AVATARS,selectedAvatar))throw Error('Selecciona un avatar de la lista.');
  await ctx.mutate('save_community_preferences',{p_opt_in:optIn,p_alias:alias,p_avatar:selectedAvatar},optIn?'Tu participación en la comunidad quedó activada.':'Tu participación pública quedó desactivada. Tu saldo personal se mantiene.');
  return true;
}
