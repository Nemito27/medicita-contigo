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
      return {...data,user:{...data.user,email:user.email}};
    },
    async rpc(name, args = {}) {
      const {data,error} = await supabase.rpc(name,args);
      if (error) throw error;
      return data;
    },
  };
}
