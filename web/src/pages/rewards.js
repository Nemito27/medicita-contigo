import {renderOverview,renderRewardSummary} from './rewards/overview.js';
import {renderCommunity,renderCommunityPreferences,communityAction,communitySubmit} from './rewards/community.js';
import {renderPeople,peopleAction,peopleSubmit} from './rewards/people.js';
import {empty} from './rewards/shared.js';

export {renderRewardSummary,renderCommunityPreferences};

export function renderRewards(page,ctx){
  if(!ctx.data?.user)return `<section class="card">${empty('Ingresa para consultar tus coronitas','Tu saldo y tus reconocimientos pertenecen a tu cuenta personal.')}</section>`;
  if(page==='rewards')return renderOverview(ctx);
  if(page==='community')return renderCommunity(ctx);
  if(page==='people-rewards'||page==='patients')return renderPeople(ctx);
  return `<section class="card">${empty('Sección de coronitas no disponible','Selecciona Mis coronitas o Comunidad desde el menú.')}</section>`;
}

export async function handleRewardAction(ctx,action,id=''){
  if(!String(action).startsWith('reward-'))return false;
  const version=ctx.sessionVersion?.();
  if(action==='reward-close'){ctx.close();return true;}
  if(action==='reward-refresh'){await ctx.refresh();return true;}
  if(action==='reward-open'){ctx.navigate('rewards');return true;}
  if(action==='reward-open-community'){ctx.navigate('community');return true;}
  if(await communityAction(ctx,action,id))return true;
  if(ctx.sessionVersion?.()!==version)return true;
  return peopleAction(ctx,action,id);
}

export async function handleRewardSubmit(ctx,formId,values,form){
  if(!String(formId).startsWith('reward-'))return false;
  const version=ctx.sessionVersion?.();
  if(await communitySubmit(ctx,formId,values,form))return true;
  if(ctx.sessionVersion?.()!==version)return true;
  return peopleSubmit(ctx,formId,values,form);
}
