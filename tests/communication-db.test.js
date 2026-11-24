import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';

// Run the actual SQL through PostgreSQL, with the same JWT ownership and roles
// used by Supabase. Fixtures and clock adjustments are confined to this local DB.
let db,room,service,migration;
const admin=randomUUID(),reception=randomUUID(),supervisor=randomUUID(),preexisting=randomUUID();
async function root(sql,params=[]){await db.exec('reset role');return db.query(sql,params)}
async function as(user,sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`);return db.query(sql,params)}
async function value(user,sql,params=[]){return (await as(user,sql,params)).rows[0].value}
async function user(role='patient',name='Persona ficticia'){const id=randomUUID();await root('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${id}@example.invalid`,JSON.stringify({given_name:name})]);if(role!=='patient')await root('update profiles set role=$1 where id=$2',[role,id]);return id}
async function post(id,body,opts={}){return value(id,'select post_room_comment($1,$2,$3,$4) as value',[opts.room||room,body,opts.parent||null,opts.alias||null])}
async function comments(id,box=room){return value(id,'select get_room_comments($1) as value',[box])}
async function ageComments(id,interval='2 minutes'){await root('update room_comments set created_at=now()-$2::interval where author_id=$1',[id,interval])}
async function appointment(patient,{status='arrived',day=0}={}){
 const box=randomUUID(),professional=randomUUID(),slot=randomUUID(),id=randomUUID();
 await root("insert into rooms(id,name,specialty,status) values($1,$2,'Medicina general','busy')",[box,`Box ficticio ${box.slice(0,8)}`]);
 await root('insert into professionals(id,full_name,service_id) values($1,$2,$3)',[professional,`Profesional ficticio ${professional.slice(0,8)}`,service]);
 await root("insert into slots(id,room_id,professional_id,service_id,starts_at,ends_at,duration_minutes) select $1,$2,$3,$4,t,t+interval '30 minutes',30 from(select(date_trunc('day',now() at time zone 'America/Santiago') at time zone 'America/Santiago')+$5::int*interval '1 day'+interval '10 hours' t)x",[slot,box,professional,service,day]);
 await root('insert into appointments(id,slot_id,patient_id,status) values($1,$2,$3,$4)',[id,slot,patient,status]);return {id,box,slot};
}
async function call(id,request=null,actor=reception){return value(actor,'select call_to_box($1,$2) as value',[id,request])}
async function calls(id,pending=true){return value(id,'select get_box_calls($1) as value',[pending])}
before(async()=>{
 db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.exec(await readFile('supabase/migrations/20261116033253_contigo.sql','utf8'));
 await root("insert into auth.users(id,email) values($1,'previous@example.invalid')",[preexisting]);
 await root("update profiles set preferences=preferences||'{\"simple_mode\":true,\"reminder_hours\":[36,3]}'::jsonb where id=$1",[preexisting]);
 migration=await readFile('supabase/migrations/20261124205903_contigo_comunicacion_visual_20261124.sql','utf8');await db.exec(migration);
 for(const [id,role] of [[admin,'admin'],[reception,'reception'],[supervisor,'supervisor']]){await root('insert into auth.users(id,email) values($1,$2)',[id,`${role}@example.invalid`]);await root('update profiles set role=$1 where id=$2',[role,id])}
 room=(await root('select id from rooms order by name limit 1')).rows[0].id;service=(await root("select id from services where name='Medicina general'")).rows[0].id;
});
after(async()=>{await db?.close()});

test('accessibility preferences preserve old values and persist without onboarding or broad profile access',async()=>{
 const p=(await root('select preferences,onboarded from profiles where id=$1',[preexisting])).rows[0];
 assert.equal(p.preferences.simple_mode,true);assert.deepEqual(p.preferences.reminder_hours,[36,3]);assert.equal(p.preferences.visual_mode,false);assert.equal(p.preferences.vibration_enabled,false);assert.equal(p.onboarded,false);
 await as(preexisting,"select save_accessibility_preferences('{\"visual_mode\":true,\"vibration_enabled\":true}')");
 const saved=(await as(preexisting,'select preferences,onboarded from profiles')).rows[0];assert.equal(saved.preferences.visual_mode,true);assert.equal(saved.preferences.vibration_enabled,true);assert.equal(saved.onboarded,false);assert.equal(saved.preferences.simple_mode,true);
 await assert.rejects(as(preexisting,"select save_accessibility_preferences('{\"role\":\"admin\"}')"),/inválidas/);
 await assert.rejects(as(preexisting,"select save_accessibility_preferences('{\"visual_mode\":\"true\"}')"),/verdadero o falso/);
 await assert.rejects(as(preexisting,"select save_accessibility_preferences('{\"receive_offers\":false}')"),/inválidas/);
 await assert.rejects(as(null,"select save_accessibility_preferences('{}')"),/permission denied/);
});

test('save_profile accepts new preferences while retaining all original field and reminder validation',async()=>{
 const p=await user();
 await as(p,"select save_profile('Nombre ficticio','Apellido','', '{\"visual_mode\":true,\"vibration_enabled\":false,\"reminder_hours\":[48,2],\"receive_offers\":false}')");
 const saved=(await as(p,'select full_name,onboarded,preferences from profiles')).rows[0];assert.equal(saved.full_name,'Nombre ficticio');assert.equal(saved.onboarded,true);assert.equal(saved.preferences.visual_mode,true);assert.equal(saved.preferences.receive_offers,false);
 for(const pref of [{reminder_hours:[0]},{reminder_hours:[73]},{reminder_hours:[1.5]},{reminder_hours:[1,2,3,4,5]},{reminder_hours:'24'},{simple_mode:1},{vibration_enabled:null},{role:'admin'}])await assert.rejects(as(p,"select save_profile('Nombre','','',$1::jsonb)",[JSON.stringify(pref)]));
 await assert.rejects(as(p,"select save_profile('A','','','{}')"));
});

test('server moderation rejects Chilean insults with case, accents, leetspeak, spacing, repetitions and punctuation',async()=>{
 const p=await user();
 for(const text of ['WEON','¡weón!','w3on','w e o n','weeoooon','w e e o o n','huevóóón','c*u*l*i*a*o','c0nch3tum4dre','CTM!','q l o','p u t @','m!erda','we\u200bon','s a c o d e w e a s'])await assert.rejects(post(p,text),/reformúlalo con respeto/,text);
 assert.equal((await root('select count(*)::int n from room_comments where author_id=$1',[p])).rows[0].n,0);
});

test('whole-word checks allow innocent words and keep HTML as untrusted plain text',async()=>{
 const p=await user();
 for(const text of ['Mi computador está disponible','La disputa se resolvió con respeto','Su reputación es buena','Traje huevos para cocinar','Gracias por ayudar con mi vehículo']){
  const id=await post(p,text);assert.equal((await root('select body,status from room_comments where id=$1',[id])).rows[0].body,text);await ageComments(p);
 }
 // The valid-language samples already use this account's five-post allowance.
 // Test HTML storage with a fresh actor rather than bypassing the hourly guard.
 const raw='<img src=x onerror="alert(1)"><script>alert(2)</script>',htmlId=await post(await user(),raw);
 assert.equal((await root('select body from room_comments where id=$1',[htmlId])).rows[0].body,raw);
 const html=(await comments(p)).items.find(x=>x.body.startsWith('<img'));assert.equal(html.status,'published');assert.ok(!Object.hasOwn(html,'author_id'));
});

test('500-character limit and suspicious contact review are enforced server-side with owner-only pending visibility',async()=>{
 const p=await user(),other=await user();
 await assert.rejects(post(p,''),/1 y 500/);await assert.rejects(post(p,'a'.repeat(501)),/1 y 500/);
 await post(p,'a'.repeat(500));await ageComments(p);
 for(const text of ['Revisar https://example.invalid para coordinar','Escríbeme a ficticio@example.invalid','Este contacto 912345678 debe revisarse']){
  const id=await post(p,text);const own=(await comments(p)).items.find(x=>x.id===id);assert.equal(own.status,'pending');assert.equal(own.can_edit,true);assert.equal(own.can_withdraw,true);assert.ok(!(await comments(other)).items.some(x=>x.id===id));assert.ok((await comments(admin)).items.some(x=>x.id===id));await ageComments(p);
 }
 await assert.rejects(post(p,'Texto seguro',{alias:'test@example.invalid'}),/alias breve/);
 await assert.rejects(post(p,'Texto seguro',{alias:'WEON'}),/reformúlalo/);
 await assert.rejects(post(p,'Texto seguro',{alias:'Equipo Medicita'}),/alias personal/);
});

test('cooldown, canonical duplicate detection and hourly cap are independent constraints',async()=>{
 const p=await user();await post(p,'Gracias por la orientación');
 await assert.rejects(post(p,'Otro texto diferente'),/30 segundos/);await ageComments(p);
 await assert.rejects(post(p,'GRACIAS POR LA ORIENTACIÓN'),/repetidamente/);
 for(let i=2;i<=5;i++){await post(p,`Aporte seguro número ${i}`);await ageComments(p)}
 await assert.rejects(post(p,'Un sexto comentario distinto'),/límite de comentarios/);
 await ageComments(p,'25 hours');await post(p,'Gracias por la orientación');
});

test('only the author can edit or withdraw; edits are rescanned and 24-hour window is returned',async()=>{
 const p=await user(),other=await user(),id=await post(p,'Observación original');
 await assert.rejects(as(other,"select edit_room_comment($1,'Cambio ajeno')",[id]),/propio comentario/);
 await assert.rejects(as(other,'select withdraw_room_comment($1)',[id]),/propio comentario/);
 await assert.rejects(as(p,"select edit_room_comment($1,'w e o n')",[id]),/reformúlalo/);
 await as(p,"select edit_room_comment($1,'Observación corregida')",[id]);let item=(await comments(p)).items.find(x=>x.id===id);assert.equal(item.body,'Observación corregida');assert.ok(item.edited_at);
 await ageComments(p,'25 hours');item=(await comments(p)).items.find(x=>x.id===id);assert.equal(item.can_edit,false);assert.equal(item.can_withdraw,true);
 await assert.rejects(as(p,"select edit_room_comment($1,'Fuera de plazo')",[id]),/24 horas/);
 await as(p,'select withdraw_room_comment($1)',[id]);await as(p,'select withdraw_room_comment($1)',[id]);
 assert.ok(!(await comments(other)).items.some(x=>x.id===id));item=(await comments(p)).items.find(x=>x.id===id);assert.equal(item.status,'withdrawn');assert.equal(item.can_withdraw,false);
 assert.equal((await root("select count(*)::int n from comment_moderation_actions where comment_id=$1 and action='author_withdraw'",[id])).rows[0].n,1);
});

test('staff replies are role-derived, thread-bound and bounded; normal users cannot impersonate staff',async()=>{
 const p=await user(),id=await post(p,'¿Dónde se encuentra la sala?');
 await assert.rejects(post(await user(),'Una respuesta no autorizada',{parent:id}),/personal autorizado/);
 await ageComments(reception,'2 hours');const reply=await post(reception,'La sala está señalizada al ingreso',{parent:id,alias:'Nombre falso'});
 let item=(await comments(p)).items.find(x=>x.id===id);assert.equal(item.replies[0].id,reply);assert.equal(item.replies[0].is_staff,true);assert.equal(item.replies[0].alias,'Equipo Medicita');
 const safe=(await post(await user(),'Una observación de la organización',{alias:'Persona amable'}));assert.equal((await comments(p)).items.find(x=>x.id===safe).is_staff,false);
 await assert.rejects(post(supervisor,'Intervención del supervisor'),/supervisor/);
 // Older staff replies are retained, while each fetched thread is bounded.
 await root("insert into room_comments(room_id,author_id,parent_id,alias,body,normalized_body,is_staff) select $1,$2,$3,'Equipo Medicita','Respuesta histórica '||n,'histórica '||n,true from generate_series(1,23)n",[room,reception,id]);
 item=(await comments(p)).items.find(x=>x.id===id);assert.equal(item.replies.length,20);assert.equal(item.reply_total,24);assert.equal(item.replies_has_more,true);
});

test('reports dedupe, enter the admin review queue and preserve reasoned moderation audit',async()=>{
 const p=await user(),reporter=await user(),id=await post(p,'Observación que necesita revisión');
 await as(reporter,"select report_room_comment($1,'Solicito revisión manual')",[id]);await as(reporter,"select report_room_comment($1,'Segundo intento')",[id]);
 assert.equal((await root('select count(*)::int n from room_comment_reports where comment_id=$1',[id])).rows[0].n,1);
 await assert.rejects(as(p,"select report_room_comment($1,'Mi texto')",[id]),/propio comentario/);
 await assert.rejects(value(reception,"select get_comment_moderation('reported') as value"),/administración/);
 await assert.rejects(as(reporter,"select moderate_room_comment($1,'hidden','Revisión requerida')",[id]),/administración/);
 let queue=await value(admin,"select get_comment_moderation('reported') as value");let row=queue.items.find(x=>x.id===id);assert.equal(row.report_count,1);assert.equal(row.reports[0].reason,'Solicito revisión manual');assert.ok(!Object.hasOwn(row,'author_id'));
 await assert.rejects(as(admin,"select moderate_room_comment($1,'hidden','')",[id]),/motivo/);
 await as(admin,"select moderate_room_comment($1,'hidden','Datos revisados por administración')",[id]);assert.ok(!(await comments(reporter)).items.some(x=>x.id===id));
 assert.ok(!(await value(admin,"select get_comment_moderation('reported') as value")).items.some(x=>x.id===id));
 assert.equal((await root('select action,reason from comment_moderation_actions where comment_id=$1 order by id desc',[id])).rows[0].action,'hidden');
 await as(p,'select withdraw_room_comment($1)',[id]);await assert.rejects(as(admin,"select moderate_room_comment($1,'published','Intento de restauración')",[id]),/retirado/);
});

test('moderation terms are configurable only by admin using words and mandatory audited reasons',async()=>{
 const p=await user();
 await assert.rejects(as(reception,"select save_moderation_term('ofensaprueba',true,'Prueba controlada')"),/administración/);
 await assert.rejects(as(admin,"select save_moderation_term('.*',true,'Prueba controlada')"),/palabra o expresión/);
 await assert.rejects(as(admin,"select save_moderation_term('ofensaprueba',true,'')"),/motivo/);
 await as(admin,"select save_moderation_term('ofensaprueba',true,'Término de prueba controlada')");await assert.rejects(post(p,'OFENSA PRUEBA'),/reformúlalo/);
 await as(admin,"select save_moderation_term('ofensaprueba',false,'Desactivar prueba controlada')");await post(p,'OFENSA PRUEBA');
 assert.equal((await root("select count(*)::int n from comment_moderation_actions where action='term_updated' and actor_id=$1",[admin])).rows[0].n,2);
});

test('RLS and grants deny other-author records, anonymous comments and direct writes/private helpers',async()=>{
 const p=await user(),other=await user(),id=await post(p,'Texto público con autor privado');
 assert.equal((await as(other,'select * from room_comments where id=$1',[id])).rows.length,0);assert.equal((await as(p,'select * from room_comments where id=$1',[id])).rows.length,1);
 await assert.rejects(as(null,'select get_room_comments($1)',[room]),/permission denied/);
 await assert.rejects(as(p,"update room_comments set status='published' where id=$1",[id]),/permission denied/);
 await assert.rejects(as(p,"select app_private.comment_status('texto')"),/permission denied/);
 await assert.rejects(as(p,"select app_private.comment_normalize('texto')"),/permission denied/);
 assert.equal((await as(p,'select * from comment_moderation_terms')).rows.length,0);
});

test('box calling requires authorized staff, arrived appointment and the actual local care day',async()=>{
 const p=await user(),a=await appointment(p),reserved=await appointment(p,{status:'reserved'}),future=await appointment(p,{day:1});
 await assert.rejects(call(a.id,null,p),/personal autorizado/);await assert.rejects(call(a.id,null,supervisor),/personal autorizado/);
 await assert.rejects(call(reserved.id),/llegada registrada/);await assert.rejects(call(future.id),/día de la atención/);
 const before=(await root('select count(*)::int n from box_calls')).rows[0].n;
 await root("update rooms set status='free' where id=$1",[a.box]);assert.equal((await root('select count(*)::int n from box_calls')).rows[0].n,before);
 assert.ok(await call(a.id));
});

test('calling retry and active-call dedupe persist one private internal notification and no external delivery',async()=>{
 const p=await user(),a=await appointment(p),request=randomUUID(),id=await call(a.id,request);
 assert.equal(await call(a.id,request),id);assert.equal(await call(a.id,randomUUID()),id);assert.equal(await call(a.id),id);
 assert.equal((await root('select count(*)::int n from box_calls where appointment_id=$1',[a.id])).rows[0].n,1);
 const n=(await root("select id,patient_id,box_call_id from notifications where appointment_id=$1 and kind='box_call'",[a.id])).rows;assert.equal(n.length,1);assert.equal(n[0].patient_id,p);assert.equal(n[0].box_call_id,id);
 assert.deepEqual((await root('select channel from notification_deliveries where notification_id=$1',[n[0].id])).rows,[{channel:'internal'}]);
 assert.equal((await root("select count(*)::int n from box_call_events where call_id=$1 and event='called'",[id])).rows[0].n,1);
 const other=await appointment(p);await assert.rejects(call(other.id,request),/otro llamado/);
});

test('pending calls recover across sessions and responses belong exclusively to the recipient',async()=>{
 const p=await user(),other=await user(),a=await appointment(p),id=await call(a.id);
 let own=(await calls(p)).find(x=>x.id===id);assert.equal(own.status,'pending');assert.match(own.message,/Es tu turno/);assert.ok(!Object.hasOwn(own,'patient_name'));
 assert.ok(!(await calls(other)).some(x=>x.id===id));assert.deepEqual(await calls(supervisor),[]);await assert.rejects(calls(null),/permission denied/);
 assert.equal((await as(other,'select * from box_calls where id=$1',[id])).rows.length,0);
 await assert.rejects(as(other,"select respond_box_call($1,'help')",[id]),/propio llamado/);await assert.rejects(as(p,"select respond_box_call($1,'closed')",[id]),/no es válida/);
 await as(p,"select respond_box_call($1,'received')",[id]);await as(p,"select respond_box_call($1,'received')",[id]);await as(p,"select respond_box_call($1,'help')",[id]);await as(p,"select respond_box_call($1,'received')",[id]);await as(p,"select respond_box_call($1,'help')",[id]);
 own=(await calls(p)).find(x=>x.id===id);assert.equal(own.status,'help');assert.ok(own.received_at);assert.ok(own.responded_at);
 const receipt=(await calls(reception)).find(x=>x.id===id);assert.equal(receipt.status,'help');assert.match(receipt.patient_name,/Persona ficticia/);
 const events=(await root('select event from box_call_events where call_id=$1 order by id',[id])).rows.map(x=>x.event);assert.deepEqual(events,['called','received','help']);
 await as(p,"select respond_box_call($1,'understood')",[id]);assert.ok(!(await calls(p)).some(x=>x.id===id));assert.equal((await calls(p,false)).find(x=>x.id===id).status,'understood');assert.equal((await calls(reception)).find(x=>x.id===id).status,'understood');
});

test('anonymous public room feed contains only opaque turn code, box, timestamp and generic state, bounded to recent active calls',async()=>{
 const p=await user(),a=await appointment(p),id=await call(a.id);let feed=await value(null,'select get_public_box_calls($1) as value',[a.box]);
 assert.equal(feed.length,1);assert.deepEqual(Object.keys(feed[0]).sort(),['created_at','room_name','status','turn_code']);assert.match(feed[0].turn_code,/^T-[A-F0-9]{10}$/);assert.equal(feed[0].status,'calling');
 await as(p,"select respond_box_call($1,'help')",[id]);feed=await value(null,'select get_public_box_calls($1) as value',[a.box]);assert.equal(feed[0].status,'calling');assert.ok(!JSON.stringify(feed).includes(p));assert.ok(!JSON.stringify(feed).includes(id));
 await root("update box_calls set created_at=now()-interval '16 minutes' where id=$1",[id]);assert.deepEqual(await value(null,'select get_public_box_calls($1) as value',[a.box]),[]);
 await assert.rejects(as(null,'select * from box_calls'),/permission denied/);await assert.rejects(as(p,"update box_calls set status='understood' where id=$1",[id]),/permission denied/);
});

test('only staff closes calls; retries and completed appointments keep a single closure and retained history',async()=>{
 const p=await user(),a=await appointment(p),id=await call(a.id);await assert.rejects(as(p,'select close_box_call($1)',[id]),/personal autorizado/);
 await as(reception,'select close_box_call($1)',[id]);await as(reception,'select close_box_call($1)',[id]);assert.ok(!(await calls(p)).some(x=>x.id===id));assert.ok((await calls(p,false)).find(x=>x.id===id).closed_at);
 assert.equal((await root("select count(*)::int n from box_call_events where call_id=$1 and event='closed'",[id])).rows[0].n,1);await assert.rejects(as(p,"select respond_box_call($1,'help')",[id]),/cerró/);
 const a2=await appointment(p),id2=await call(a2.id);await as(reception,"select change_appointment($1,'complete')",[a2.id]);assert.ok((await root('select closed_at from box_calls where id=$1',[id2])).rows[0].closed_at);assert.ok(!(await calls(p)).some(x=>x.id===id2));assert.ok((await calls(p,false)).some(x=>x.id===id2));
});

test('communication migration is repeatable without duplicating records, resetting preferences or changing old functionality',async()=>{
 const p=await user();await as(p,"select save_accessibility_preferences('{\"visual_mode\":true}')");const comment=await post(p,'Registro conservado al repetir migración');
 const before=(await root('select(select count(*) from comment_moderation_terms)::int terms,(select count(*) from room_comments)::int comments,(select count(*) from box_calls)::int calls')).rows[0];
 await db.exec('reset role');await db.exec(migration);
 const after=(await root('select(select count(*) from comment_moderation_terms)::int terms,(select count(*) from room_comments)::int comments,(select count(*) from box_calls)::int calls')).rows[0];assert.deepEqual(after,before);
 assert.equal((await as(p,'select preferences from profiles')).rows[0].preferences.visual_mode,true);assert.ok((await comments(p)).items.some(x=>x.id===comment));
 assert.ok(await value(p,"select get_snapshot('{}') as value"));
});
