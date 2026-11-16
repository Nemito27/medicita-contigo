import publicProject from './public-project.json';
export const APP_NAME = 'Medicita Contigo';
export const PROJECT_REF = 'iqisdeyxlzpxtlbkyero';
export const AUTH_STORAGE_KEY = 'medicita-contigo-auth-v2';
export const A11Y_STORAGE_KEY = 'medicita-contigo-a11y-v2';
const env = import.meta.env || {};
// This public configuration belongs exclusively to the newly created project.
// It is safe to publish; authorization is enforced by Auth, RLS and RPC checks.
const apiUrl = env.VITE_SUPABASE_URL || publicProject.apiUrl;
const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || publicProject.publishableKey;
let configError = '';
if (apiUrl || publicKey) {
  try {
    if (new URL(apiUrl).hostname !== `${PROJECT_REF}.supabase.co`) {
      configError = 'La dirección de datos no corresponde al proyecto independiente de Medicita Contigo.';
    } else if (!publicKey.startsWith('sb_publishable_')) {
      configError = 'Configura una clave publicable del proyecto independiente.';
    }
  } catch { configError = 'La configuración de acceso no tiene una dirección válida.'; }
}
export const config = Object.freeze({
  apiUrl, publicKey, error: configError,
  configured: Boolean(apiUrl && publicKey && !configError),
  emailLoginEnabled: env.VITE_EMAIL_LOGIN_ENABLED === 'true',
  base: env.BASE_URL || './',
});
