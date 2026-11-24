import {empty} from '../components/ui.js';
import {renderModeration,commentAction,commentSubmit} from './communication/comments.js';
import {renderCalls,renderCallAlerts,renderPublicRoom,callAction,callSubmit} from './communication/calls.js';

export {renderCallAlerts,renderPublicRoom};
export {clearCommunicationState} from './communication/common.js';
export function renderCommunication(page,ctx){
 if(page==='moderation')return renderModeration(ctx);
 if(page==='calls')return renderCalls(ctx);
 if(page==='public-room')return renderPublicRoom(ctx);
 return empty('Vista no disponible','Selecciona una sección del menú.');
}
export async function handleCommunicationAction(ctx,action,id){
 if(!String(action).startsWith('comm-'))return false;
 const version=ctx.sessionVersion?.();
 if(await callAction(ctx,action,id))return true;
 if(ctx.sessionVersion?.()!==version)return true;
 return await commentAction(ctx,action,id);
}
export async function handleCommunicationSubmit(ctx,formId,values){
 if(!String(formId).startsWith('comm-'))return false;
 const version=ctx.sessionVersion?.();
 if(await callSubmit(ctx,formId,values))return true;
 if(ctx.sessionVersion?.()!==version)return true;
 return await commentSubmit(ctx,formId,values);
}
export function updateCommentFeedback(field){
 if(!field?.matches?.('[data-comm-body]'))return;
 const group=field.closest('.field'),value=String(field.value||''),counter=group?.querySelector('[data-comm-count]'),help=group?.querySelector('[data-comm-help]');
 if(counter)counter.textContent=`${value.length}/500 caracteres`;
 if(!help)return;
 const substitutions={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'};
 const plain=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[013457@$]/g,letter=>substitutions[letter]).replace(/([a-z])\1+/g,'$1'),contact=/(?:https?:\/\/|www\.|\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b|(?:\+?56\s*)?9(?:[ .-]*\d){8}\b)/i.test(value);
 const rude=['weon','weona','huevon','huevona','culiao','culiada','conchetumadre','conchetumare','mierda','puto','puta','imbecil','idiota'].some(term=>new RegExp(`(?:^|[^a-z0-9])${[...term].map(letter=>`${letter}+(?:[^a-z0-9]*${letter}+)*`).join('[^a-z0-9]*')}(?:$|[^a-z0-9])`).test(plain));
 help.textContent=rude?'Revisa el tono y reformula la observación con respeto. El servidor decidirá si puede publicarse.':contact?'Evita enlaces y datos de contacto. El contenido puede quedar pendiente de revisión.':'Escribe con respeto. El contenido se valida en el servidor antes de mostrarse.';
 help.classList.toggle('comm-editor-warning',rude||contact);
}
if(typeof document!=='undefined')document.addEventListener('input',event=>updateCommentFeedback(event.target));
