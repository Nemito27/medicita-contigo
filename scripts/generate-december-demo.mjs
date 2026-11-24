import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {generateDecemberDataset,DECEMBER_TAG} from '../web/src/services/demo/december.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=generateDecemberDataset();
await mkdir(`${root}web/public/demo`,{recursive:true});
await writeFile(`${root}web/public/demo/december-2026.json`,`${JSON.stringify(data)}\n`);
await writeFile(`${root}supabase/demo-december-2026.sql`,`-- Exclusively fictitious registry. No auth.users/profiles/agenda writes.\n-- Idempotent: preserve the currently stored simulation until an admin explicitly resets it.\ninsert into public.demonstration_sets(tag,template,payload,active)\nselect '${DECEMBER_TAG}',d,d,true\nfrom (select app_private.build_demo_december_dataset('2026-11-24T12:00:00Z'::timestamptz) d) fixture\non conflict(tag) do nothing;\n`);
console.log(JSON.stringify({tag:DECEMBER_TAG,patients:data.profiles.filter(p=>p.role==='patient').length,technical_actors:3,december_slots:data.slots.filter(s=>s.dataset_section==='december').length,historical_slots:39,active_appointments:data.appointments.filter(a=>['reserved','confirmed'].includes(a.status)).length,waiting:data.waiting.length,offers:data.offers.length}));
