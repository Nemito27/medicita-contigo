export {dateLabel, dayKey, chileInput, chileToIso, addDays} from '../utils/date.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const paths = {
  crown:'m2 6 5 5 5-7 5 7 5-5-3 13H5ZM6 22h12',eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  home:'m3 10 9-7 9 7v11h-6v-7H9v7H3Z', calendar:'M5 5h14v16H3V5h2M7 3v4m10-4v4M3 11h18',
  bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4', user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  users:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 21v-2a7 7 0 0 1 14 0v2m2-14a3 3 0 0 1 0 6m1 3a5 5 0 0 1 2 4',
  room:'M4 21V3h12v18M2 21h20M9 12h1m6-7h4v16', chart:'M3 3v18h18M7 17v-5m5 5V7m5 10V4',
  list:'M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1', qr:'M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3Zm12 0h3v3h3v3h-6Zm6-3v3',
  heart:'M12 21S1 14 3 7c2-5 8-4 9 0 1-4 7-5 9 0 2 7-9 14-9 14Z', help:'M9 9a3 3 0 1 1 5 2l-2 2v1m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrow:'M4 12h15m-6-6 6 6-6 6', check:'m5 12 4 4L19 6', clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-4 10 3 3 5-6', download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  plus:'M12 5v14M5 12h14', logout:'M9 3H3v18h6m5-15 6 6-6 6M8 12h12', warning:'M12 3 2 21h20Zm0 5v6m0 3h.01', search:'m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.calendar}"/></svg>`;
export const btn = (label, action, id = '', variant = 'primary', attrs = '') => `<button type="button" class="btn btn-${esc(variant)}" data-action="${esc(action)}" data-id="${esc(id)}" ${attrs}>${label}</button>`;
export const badge = (label, tone = 'neutral') => `<span class="badge badge-${esc(tone)}">${esc(label)}</span>`;
export const empty = (title, description = '', actionHtml = '') => `<div class="empty"><span class="empty-icon">${icon('calendar')}</span><h3>${esc(title)}</h3>${description ? `<p class="muted">${esc(description)}</p>` : ''}${actionHtml}</div>`;
export const mascot = message => `<div class="mascot-note"><img src="./assets/con-tigo.png" alt="" width="60" height="64"><p>${esc(message)}</p></div>`;
export const brand = () => `<a class="brand" href="#" data-action="brand-home" aria-label="Medicita Contigo, inicio"><span class="brand-mark"><img src="./assets/con-tigo.png" alt="" width="44" height="48"></span><span class="brand-copy"><strong>Medicita <span>Contigo</span></strong><small>SIEMPRE CON TIGO</small></span></a>`;
