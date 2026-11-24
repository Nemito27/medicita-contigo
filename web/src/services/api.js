import {createClient} from '@supabase/supabase-js';
import {config, AUTH_STORAGE_KEY} from '../config/app.js';
export const supabase = config.configured ? createClient(config.apiUrl, config.publicKey, {
  auth:{flowType:'pkce',storageKey:AUTH_STORAGE_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  global:{fetch:(input, options = {}) => fetch(input, {...options, cache:'no-store'})},
}) : null;
export async function googleLogin() {
  if (!supabase) throw Error(config.error || 'El proyecto independiente necesita configurar el acceso. Puedes explorar la demostración identificada.');
  const response = await fetch(`${config.apiUrl}/auth/v1/settings`, {headers:{apikey:config.publicKey},cache:'no-store'});
  if (!response.ok) throw Error('No pudimos comprobar el servicio de ingreso. Inténtalo otra vez.');
  const settings = await response.json();
  if (!settings.external?.google) throw Error('El acceso Google del proyecto nuevo está pendiente de activación. La demostración funciona por separado.');
  const {error} = await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('.',location.href).href,scopes:'openid email profile'}});
  if (error) throw error;
}
export async function emailLogin(email) {
  if (!supabase || !config.emailLoginEnabled) throw Error('El ingreso por enlace de correo necesita configurar el remitente del proyecto nuevo. Por ahora usa Google o la demostración.');
  const {error} = await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:new URL('.',location.href).href}});
  if (error) throw error;
}
export function createLiveService() {
  if (!supabase) throw Error('El acceso independiente aún no está configurado.');
  return {
    async load(filters) {
      const {data:{user},error} = await supabase.auth.getUser();
      if (error || !user) throw Object.assign(Error('Vuelve a ingresar para verificar tu sesión.'), {code:'SESSION_REQUIRED'});
      const {data,error:queryError} = await supabase.rpc('get_snapshot', {p_filters:filters});
      if (queryError) throw queryError;
      if (!data?.user || data.user.id !== user.id) throw Object.assign(Error('La sesión cambió. Ingresa nuevamente.'), {code:'SESSION_REQUIRED'});
      const read=async(name,args={})=>{const result=await supabase.rpc(name,args);if(result.error)throw result.error;return result.data;};
      const [rewards,boxCalls,people,community,moderation]=await Promise.all([
        read('get_my_rewards'),
        data.user.role==='supervisor'?Promise.resolve([]):read('get_box_calls',{p_pending_only:true}),
        data.user.role==='admin'&&['patients','people-rewards'].includes(filters?.view)?read('get_people_rewards',{
          p_query:filters.people_query||'',p_level:filters.people_level||'',p_order:filters.people_order||'crowns_desc',
          p_offset:Number(filters.people_offset||0),p_limit:25,
        }):Promise.resolve(null),
        filters?.view==='community'?read('get_reward_community',{p_offset:Number(filters.community_offset||0),p_limit:25}):Promise.resolve(null),
        data.user.role==='admin'&&filters?.view==='moderation'?read('get_comment_moderation',{p_status:filters.moderation_status||'pending',p_offset:Number(filters.moderation_offset||0),p_limit:25}):Promise.resolve(null),
      ]);
      return {...data,user:{...data.user,email:user.email},rewards,box_calls:boxCalls||[],people_rewards:people,community,comment_moderation:moderation};
    },
    async rpc(name, args = {}) {
      const {data,error} = await supabase.rpc(name,args);
      if (error) throw error;
      return data;
    },
    async getBoxCalls(){
      const {data,error}=await supabase.rpc('get_box_calls',{p_pending_only:true});
      if(error)throw error;return data||[];
    },
    subscribeCalls(user,onChange,onStatus=()=>{}){
      if(user.role==='supervisor')return ()=>{};
      const options={event:'*',schema:'public',table:'box_calls'};
      if(user.role==='patient')options.filter=`patient_id=eq.${user.id}`;
      const channel=supabase.channel(`contigo-box-calls-${user.id}-${Date.now()}`)
        .on('postgres_changes',options,()=>onChange())
        .subscribe(status=>{onStatus(status);if(status==='SUBSCRIBED')onChange();});
      return ()=>{supabase.removeChannel(channel).catch(()=>{});};
    },
  };
}

export async function getPublicBoxCalls(roomId=null){
  if(!supabase)throw Error('No pudimos conectar con la sala.');
  const {data,error}=await supabase.rpc('get_public_box_calls',{p_room:roomId||null});
  if(error)throw error;return data||[];
}
export async function fetchDemonstrationDataset(){
  if(!supabase)throw Error('El conjunto de demostración no está disponible.');
  const {data,error}=await supabase.rpc('get_demo_dataset',{p_tag:'medicita-december-2026-v1'});
  if(error)throw error;
  const dataset=data?.payload||data?.data||data?.dataset||data;
  if(!dataset||dataset.dataset_tag!=='medicita-december-2026-v1'||dataset.is_demo!==true){
    throw Error('El conjunto ficticio de diciembre está retirado o todavía no está disponible.');
  }
  return dataset;
}
