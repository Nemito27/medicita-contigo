-- Medicita Contigo: comentarios moderados y comunicación visual persistente.
-- Additive migration; preserves the independent application's existing records.
begin;

create table if not exists public.room_comments (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id),
 author_id uuid not null references public.profiles(id),
 parent_id uuid references public.room_comments(id),
 alias text not null check(length(alias) between 2 and 40),
 avatar text not null default 'contigo',
 body text not null check(length(body) between 1 and 500),
 normalized_body text not null,
 status text not null default 'published' check(status in ('published','pending','hidden','withdrawn')),
 is_staff boolean not null default false,
 created_at timestamptz not null default now(),
 edited_at timestamptz,withdrawn_at timestamptz,
 moderated_at timestamptz,moderated_by uuid references public.profiles(id),moderation_reason text
);
create index if not exists room_comments_room_date on public.room_comments(room_id,created_at desc);
create index if not exists room_comments_author_date on public.room_comments(author_id,created_at desc);
create index if not exists room_comments_parent on public.room_comments(parent_id);
create index if not exists room_comments_review on public.room_comments(status,created_at desc);
create index if not exists room_comments_moderator on public.room_comments(moderated_by);

create table if not exists public.room_comment_reports (
 id uuid primary key default gen_random_uuid(),comment_id uuid not null references public.room_comments(id),
 reporter_id uuid not null references public.profiles(id),reason text not null check(length(reason) between 2 and 200),
 created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references public.profiles(id),
 unique(comment_id,reporter_id)
);
create index if not exists comment_reports_pending on public.room_comment_reports(comment_id,resolved_at);
create index if not exists comment_reports_author on public.room_comment_reports(reporter_id,created_at desc);
create index if not exists comment_reports_resolver on public.room_comment_reports(resolved_by);

create table if not exists public.comment_moderation_terms (
 term_key text primary key check(length(term_key) between 2 and 60),
 term text not null check(length(term) between 2 and 80),active boolean not null default true,
 updated_at timestamptz not null default now()
);
create table if not exists public.comment_moderation_actions (
 id bigint generated always as identity primary key,comment_id uuid references public.room_comments(id),
 actor_id uuid not null references public.profiles(id),action text not null,reason text not null,
 created_at timestamptz not null default now()
);
create index if not exists comment_actions_comment on public.comment_moderation_actions(comment_id,created_at desc);
create index if not exists comment_actions_actor on public.comment_moderation_actions(actor_id);

create table if not exists public.box_calls (
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.appointments(id),
 patient_id uuid not null references public.profiles(id),room_id uuid not null references public.rooms(id),
 called_by uuid not null references public.profiles(id),request_id uuid unique,
 turn_code text not null unique,
 message text not null,
 status text not null default 'pending' check(status in ('pending','received','understood','help')),
 created_at timestamptz not null default now(),received_at timestamptz,responded_at timestamptz,closed_at timestamptz
);
create unique index if not exists one_open_call_per_appointment on public.box_calls(appointment_id) where closed_at is null;
create index if not exists box_calls_appointment on public.box_calls(appointment_id);
create index if not exists box_calls_patient_date on public.box_calls(patient_id,created_at desc);
create index if not exists box_calls_staff_date on public.box_calls(created_at desc) where closed_at is null;
create index if not exists box_calls_room_date on public.box_calls(room_id,created_at desc);
create index if not exists box_calls_actor on public.box_calls(called_by);
create table if not exists public.box_call_events (
 id bigint generated always as identity primary key,call_id uuid not null references public.box_calls(id),
 actor_id uuid references public.profiles(id),event text not null,created_at timestamptz not null default now()
);
create index if not exists box_call_events_call on public.box_call_events(call_id,created_at);
create index if not exists box_call_events_actor on public.box_call_events(actor_id);
alter table public.notifications add column if not exists box_call_id uuid references public.box_calls(id);
create index if not exists notifications_box_call on public.notifications(box_call_id);

alter table public.profiles alter column preferences set default '{"simple_mode":false,"high_contrast":false,"reduce_motion":false,"reminder_hours":[48,24,2],"receive_offers":true,"visual_mode":false,"vibration_enabled":false}';
update public.profiles set preferences='{"visual_mode":false,"vibration_enabled":false}'::jsonb||preferences
where not(preferences ? 'visual_mode') or not(preferences ? 'vibration_enabled');

-- Normalize accents, common substitutions, zero-width separators and repeated
-- letters. Word-boundaries are checked separately; substrings are never enough.
create or replace function app_private.comment_normalize(p_body text) returns text
language plpgsql immutable set search_path='' as $$declare v text;begin
 v:=lower(normalize(coalesce(p_body,''),NFKC));
 v:=translate(v,'áéíóúüñàèìòùäëïöâêîôû','aeiouunaeiouaeioaeiou');
 v:=translate(v,'01345789@$!|','oieastbgasii');
 v:=translate(v,chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279),'');
 v:=regexp_replace(v,'([a-z])([^a-z0-9]*\1)+','\1','g');
 return regexp_replace(trim(v),'[[:space:]]+',' ','g');
end$$;
create or replace function app_private.comment_term_key(p_term text) returns text
language sql immutable set search_path='' as $$select regexp_replace(app_private.comment_normalize(p_term),'[^a-z]','','g')$$;

insert into public.comment_moderation_terms(term_key,term)
select app_private.comment_term_key(v),v from unnest(array[
 'weon','weona','huevon','huevona','hueon','culiao','culia','culiado','qlo','ql','ctm',
 'conchetumare','conchetumadre','chuchatumare','mierda','puta','puto','imbecil','idiota','maricon','saco de weas'
])v on conflict(term_key) do nothing;

create or replace function app_private.comment_status(p_body text) returns text
language plpgsql stable security definer set search_path='' as $$declare v text;v_punctuation text;t record;pattern text;begin
 if p_body is null or length(trim(p_body)) not between 1 and 500 then raise exception 'Escribe un comentario de entre 1 y 500 caracteres';end if;
 v:=app_private.comment_normalize(p_body);
 -- These characters may be either leetspeak or punctuation. Check both
 -- interpretations so that a trailing exclamation cannot hide a blocked word.
 v_punctuation:=app_private.comment_normalize(regexp_replace(p_body,'[!|@$]',' ','g'));
 for t in select term_key from public.comment_moderation_terms where active loop
  pattern:='\m'||array_to_string(regexp_split_to_array(t.term_key,''),'[^a-z0-9]*')||'\M';
  if v~pattern or v_punctuation~pattern then raise exception 'Tu comentario contiene una expresión que no podemos publicar. Por favor, reformúlalo con respeto';end if;
 end loop;
 -- Contact information and links require manual review; never auto-publish them.
 if p_body~*'https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}' or p_body~'([0-9][ .-]*){8,}' then return 'pending';end if;
 return 'published';
end$$;

create or replace function app_private.comment_json(p_comment public.room_comments,p_user uuid,p_moderator boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_comment.id,'room_id',p_comment.room_id,'room_name',r.name,
  'alias',p_comment.alias,'avatar',p_comment.avatar,'body',p_comment.body,'status',p_comment.status,
  'is_mine',p_comment.author_id=p_user,'is_staff',p_comment.is_staff,'created_at',p_comment.created_at,'edited_at',p_comment.edited_at,
  'can_edit',p_comment.author_id=p_user and p_comment.status in('published','pending') and p_comment.created_at>=now()-interval '24 hours',
  'can_withdraw',p_comment.author_id=p_user and p_comment.status<>'withdrawn',
  'reported_by_me',exists(select 1 from public.room_comment_reports z where z.comment_id=p_comment.id and z.reporter_id=p_user),
  'report_count',case when p_moderator then (select count(*) from public.room_comment_reports z where z.comment_id=p_comment.id and z.resolved_at is null) else null end,
  'moderation_reason',case when p_moderator or p_comment.author_id=p_user then p_comment.moderation_reason else null end)
 from public.rooms r where r.id=p_comment.room_id
$$;

create or replace function public.get_room_comments(p_room uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid;m boolean;v_items jsonb;v_total integer;l integer;o integer;begin
 u:=app_private.require_user();m:=app_private.actor_role()='admin';
 if not exists(select 1 from public.rooms where id=p_room) then raise exception 'No encontramos este box';end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'La página de comentarios no es válida';end if;
 o:=p_offset;l:=p_limit;
 select count(*) into v_total from public.room_comments c where c.room_id=p_room and c.parent_id is null and(c.status='published' or c.author_id=u or m);
 select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]') into v_items from(
  select app_private.comment_json(c,u,m)||jsonb_build_object('replies',(
   select coalesce(jsonb_agg(app_private.comment_json(x,u,m) order by x.created_at),'[]') from(
    select * from public.room_comments where parent_id=c.id and(status='published' or author_id=u or m) order by created_at desc,id limit 20
   )x
  ),'reply_total',(select count(*) from public.room_comments x where x.parent_id=c.id and(x.status='published' or x.author_id=u or m)),
  'replies_has_more',(select count(*)>20 from public.room_comments x where x.parent_id=c.id and(x.status='published' or x.author_id=u or m))) as item,c.created_at from public.room_comments c
  where c.room_id=p_room and c.parent_id is null and(c.status='published' or c.author_id=u or m)
  order by c.created_at desc,c.id offset o limit l
 )q;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',o,'limit',l,'has_more',v_total>o+l,
  'moderation',jsonb_build_object('max_length',500,'min_interval_seconds',30,'hourly_limit',5,'notice','No compartas diagnósticos, datos personales ni información de otros pacientes'));
end$$;

create or replace function public.post_room_comment(p_room uuid,p_body text,p_parent uuid default null,p_alias text default null)
returns uuid language plpgsql security definer set search_path='' as $$declare u uuid;v_status text;v_alias text;v_staff boolean;v_id uuid;v_parent public.room_comments;begin
 u:=app_private.require_user();v_staff:=app_private.actor_role() in('admin','reception');
 if app_private.actor_role()='supervisor' then raise exception 'El perfil supervisor no publica comentarios';end if;
 if not exists(select 1 from public.rooms where id=p_room and active) then raise exception 'Este box no está disponible para comentarios';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,31000));
 v_status:=app_private.comment_status(p_body);
 if exists(select 1 from public.room_comments where author_id=u and created_at>now()-interval '30 seconds') then raise exception 'Espera 30 segundos antes de publicar otro comentario';end if;
 if (select count(*) from public.room_comments where author_id=u and created_at>now()-interval '1 hour')>=5 then raise exception 'Alcanzaste el límite de comentarios de esta hora. Puedes volver más tarde';end if;
 if exists(select 1 from public.room_comments where author_id=u and normalized_body=app_private.comment_normalize(p_body) and created_at>now()-interval '24 hours') then raise exception 'Ya recibimos este comentario. Evita enviarlo repetidamente';end if;
 if p_parent is not null then
  select * into v_parent from public.room_comments where id=p_parent and room_id=p_room and parent_id is null;
  if not found or not(v_parent.status='published' or v_parent.author_id=u or app_private.actor_role()='admin') then raise exception 'No encontramos el comentario al que quieres responder';end if;
  if not v_staff then raise exception 'Las respuestas de atención corresponden al personal autorizado';end if;
 end if;
 if v_staff then v_alias:='Equipo Medicita';else
  select coalesce(nullif(trim(p_alias),''),nullif(split_part(trim(full_name),' ',1),''),'Persona de la comunidad') into v_alias from public.profiles where id=u;
  if length(v_alias) not between 2 and 40 or v_alias~*'@|https?://|www\.|[0-9]{6,}' then
   if p_alias is not null then raise exception 'Usa un alias breve sin correo, teléfono ni enlaces';else v_alias:='Persona de la comunidad';end if;
  end if;
  if app_private.comment_normalize(v_alias)~'\m(admin|administracion|recepcion|equipo medicita)\M' then raise exception 'Elige un alias personal que no represente al equipo';end if;
  if app_private.comment_status(v_alias)<>'published' then raise exception 'Usa un alias breve sin datos personales';end if;
 end if;
 insert into public.room_comments(room_id,author_id,parent_id,alias,body,normalized_body,status,is_staff)
 values(p_room,u,p_parent,v_alias,trim(p_body),app_private.comment_normalize(p_body),v_status,v_staff) returning id into v_id;
 perform app_private.log_event('room_comment_posted',null,u,null,'Comentario de sala: '||v_status);
 return v_id;
end$$;

create or replace function public.edit_room_comment(p_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$declare u uuid;c public.room_comments;v_status text;begin
 u:=app_private.require_user();perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,31000));
 select * into c from public.room_comments where id=p_id for update;
 if not found or c.author_id<>u then raise exception 'Solo puedes editar tu propio comentario';end if;
 if c.status in('hidden','withdrawn') or c.created_at<now()-interval '24 hours' then raise exception 'El plazo de edición es de 24 horas y el comentario debe seguir disponible';end if;
 v_status:=app_private.comment_status(p_body);
 if exists(select 1 from public.room_comments where author_id=u and id<>p_id and normalized_body=app_private.comment_normalize(p_body) and created_at>now()-interval '24 hours') then raise exception 'Ya publicaste este mismo comentario';end if;
 update public.room_comments set body=trim(p_body),normalized_body=app_private.comment_normalize(p_body),status=v_status,edited_at=now(),moderated_at=null,moderated_by=null,moderation_reason=null where id=p_id;
 insert into public.comment_moderation_actions(comment_id,actor_id,action,reason) values(p_id,u,'author_edit','Edición del autor; validación repetida');
 perform app_private.log_event('room_comment_edited',null,u,null,'Comentario editado por su autor');
end$$;
create or replace function public.withdraw_room_comment(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare u uuid;c public.room_comments;begin
 u:=app_private.require_user();select * into c from public.room_comments where id=p_id for update;
 if not found or c.author_id<>u then raise exception 'Solo puedes retirar tu propio comentario';end if;
 if c.status='withdrawn' then return;end if;
 update public.room_comments set status='withdrawn',withdrawn_at=now() where id=p_id;
 insert into public.comment_moderation_actions(comment_id,actor_id,action,reason) values(p_id,u,'author_withdraw','Retirado por su autor');
 perform app_private.log_event('room_comment_withdrawn',null,u,null,'Comentario retirado por su autor');
end$$;
create or replace function public.report_room_comment(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$declare u uuid;c public.room_comments;begin
 u:=app_private.require_user();
 if p_reason is null or length(trim(p_reason)) not between 2 and 200 then raise exception 'Indica un motivo breve de entre 2 y 200 caracteres';end if;
 select * into c from public.room_comments where id=p_id;
 if not found or c.status<>'published' then raise exception 'Este comentario ya no está publicado';end if;
 if c.author_id=u then raise exception 'Puedes editar o retirar tu propio comentario';end if;
 insert into public.room_comment_reports(comment_id,reporter_id,reason) values(p_id,u,trim(p_reason)) on conflict(comment_id,reporter_id) do nothing;
 if found then perform app_private.log_event('room_comment_reported',null,u,null,'Reporte para revisión manual');end if;
end$$;

create or replace function public.moderate_room_comment(p_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$declare c public.room_comments;begin
 perform app_private.require_admin();
 if p_status not in('published','pending','hidden','withdrawn') or p_reason is null or length(trim(p_reason)) not between 5 and 300 then raise exception 'Selecciona un estado y un motivo de moderación de entre 5 y 300 caracteres';end if;
 select * into c from public.room_comments where id=p_id for update;if not found then raise exception 'No encontramos ese comentario';end if;
 if c.status='withdrawn' and p_status<>'withdrawn' then raise exception 'Un comentario retirado por su autor no vuelve a publicarse';end if;
 -- Manual approval may not bypass the configured offensive-content validator.
 if p_status='published' then perform app_private.comment_status(c.body);end if;
 update public.room_comments set status=p_status,moderated_at=now(),moderated_by=auth.uid(),moderation_reason=trim(p_reason),withdrawn_at=case when p_status='withdrawn' then coalesce(withdrawn_at,now()) else withdrawn_at end where id=p_id;
 update public.room_comment_reports set resolved_at=now(),resolved_by=auth.uid() where comment_id=p_id and resolved_at is null;
 insert into public.comment_moderation_actions(comment_id,actor_id,action,reason) values(p_id,auth.uid(),p_status,trim(p_reason));
 perform app_private.log_event('room_comment_moderated',null,c.author_id,null,'Moderación: '||p_status);
end$$;
create or replace function public.get_comment_moderation(p_status text default 'pending',p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$declare v_items jsonb;v_total integer;v_terms jsonb;begin
 perform app_private.require_admin();
 if p_status not in('all','reported','published','pending','hidden','withdrawn') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Los filtros de moderación no son válidos';end if;
 select count(*) into v_total from public.room_comments c where p_status='all' or c.status=p_status or(p_status in('pending','reported') and exists(select 1 from public.room_comment_reports r where r.comment_id=c.id and r.resolved_at is null));
 select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]') into v_items from(
  select app_private.comment_json(c,auth.uid(),true)||jsonb_build_object('parent_id',c.parent_id,
   'reports',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'created_at',r.created_at,'resolved_at',r.resolved_at) order by r.created_at),'[]') from public.room_comment_reports r where r.comment_id=c.id),
   'replies',(select coalesce(jsonb_agg(app_private.comment_json(x,auth.uid(),true) order by x.created_at),'[]') from(select * from public.room_comments where parent_id=c.id order by created_at desc,id limit 20)x)) as item,c.created_at
  from public.room_comments c where p_status='all' or c.status=p_status or(p_status in('pending','reported') and exists(select 1 from public.room_comment_reports r where r.comment_id=c.id and r.resolved_at is null))
  order by c.created_at desc,c.id offset p_offset limit p_limit
 )q;
 select coalesce(jsonb_agg(jsonb_build_object('term',term,'active',active) order by term),'[]') into v_terms from public.comment_moderation_terms;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',p_offset,'limit',p_limit,'has_more',v_total>p_offset+p_limit,'terms',v_terms);
end$$;
create or replace function public.save_moderation_term(p_term text,p_active boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$declare v_key text;begin
 perform app_private.require_admin();v_key:=app_private.comment_term_key(p_term);
 if p_term is null or length(trim(p_term)) not between 2 and 80 or length(v_key) not between 2 and 60 or p_term!~'^[[:alpha:][:space:]]+$' or p_active is null or p_reason is null or length(trim(p_reason)) not between 5 and 300 then raise exception 'Indica una palabra o expresión, su estado y un motivo de al menos 5 caracteres';end if;
 insert into public.comment_moderation_terms(term_key,term,active) values(v_key,trim(p_term),p_active)
 on conflict(term_key) do update set term=excluded.term,active=excluded.active,updated_at=now();
 insert into public.comment_moderation_actions(actor_id,action,reason) values(auth.uid(),'term_updated',trim(p_reason));
 perform app_private.log_event('moderation_term_updated',null,null,null,'Configuración de moderación actualizada');
end$$;

create or replace function public.save_profile(p_name text,p_last_name text,p_phone text,p_preferences jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$declare k text;v jsonb;begin
 perform app_private.require_user();
 if p_name is null or length(trim(p_name)) not between 2 and 100 or p_last_name is null or length(trim(p_last_name))>100 or p_phone is null or length(p_phone)>25 then raise exception 'Revisa el nombre, apellido y teléfono';end if;
 if p_preferences is null or jsonb_typeof(p_preferences)<>'object' or(p_preferences-array['simple_mode','high_contrast','reduce_motion','reminder_hours','receive_offers','visual_mode','vibration_enabled'])<>'{}'::jsonb then raise exception 'Preferencias inválidas';end if;
 foreach k in array array['simple_mode','high_contrast','reduce_motion','receive_offers','visual_mode','vibration_enabled'] loop
  if p_preferences ? k and jsonb_typeof(p_preferences->k)<>'boolean' then raise exception 'Las preferencias deben indicar verdadero o falso';end if;
 end loop;
 if p_preferences ? 'reminder_hours' then
  if jsonb_typeof(p_preferences->'reminder_hours')<>'array' or jsonb_array_length(p_preferences->'reminder_hours')>4 then raise exception 'Elige hasta cuatro recordatorios';end if;
  for v in select value from jsonb_array_elements(p_preferences->'reminder_hours') loop
   if jsonb_typeof(v)<>'number' or v::text!~'^[0-9]+$' or(v::text)::integer not between 1 and 72 then raise exception 'Los recordatorios deben estar entre 1 y 72 horas antes';end if;
  end loop;
 end if;
 update public.profiles set full_name=trim(p_name),last_name=trim(p_last_name),phone=trim(p_phone),preferences=preferences||p_preferences,onboarded=true,updated_at=now() where id=auth.uid();
 perform app_private.log_event('profile_updated',null,auth.uid(),null,'Datos mínimos y preferencias actualizados');
end$$;
create or replace function public.save_accessibility_preferences(p_preferences jsonb) returns void
language plpgsql security definer set search_path='' as $$declare k text;begin
 perform app_private.require_user();
 if p_preferences is null or jsonb_typeof(p_preferences)<>'object' or(p_preferences-array['simple_mode','high_contrast','reduce_motion','visual_mode','vibration_enabled'])<>'{}'::jsonb then raise exception 'Preferencias de accesibilidad inválidas';end if;
 foreach k in array array['simple_mode','high_contrast','reduce_motion','visual_mode','vibration_enabled'] loop
  if p_preferences ? k and jsonb_typeof(p_preferences->k)<>'boolean' then raise exception 'Las preferencias deben indicar verdadero o falso';end if;
 end loop;
 update public.profiles set preferences=preferences||p_preferences,updated_at=now() where id=auth.uid();
 perform app_private.log_event('accessibility_updated',null,auth.uid(),null,'Preferencias de presentación actualizadas');
end$$;

create or replace function public.call_to_box(p_appointment uuid,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$declare a public.appointments;s public.slots;r public.rooms;c public.box_calls;v_id uuid;v_notification uuid;begin
 perform app_private.require_staff();perform app_private.lock_schedule();
 if p_request_id is not null then
  select * into c from public.box_calls where request_id=p_request_id;
  if found then if c.appointment_id<>p_appointment then raise exception 'La referencia de reintento corresponde a otro llamado';end if;return c.id;end if;
 end if;
 select * into a from public.appointments where id=p_appointment for update;
 if not found or a.status<>'arrived' then raise exception 'Solo se puede llamar una cita con llegada registrada';end if;
 select * into s from public.slots where id=a.slot_id;select * into r from public.rooms where id=s.room_id;
 if(s.starts_at at time zone 'America/Santiago')::date<>(now() at time zone 'America/Santiago')::date then raise exception 'Los llamados corresponden al día de la atención';end if;
 select * into c from public.box_calls where appointment_id=a.id and closed_at is null;
 if found then return c.id;end if;
 insert into public.box_calls(appointment_id,patient_id,room_id,called_by,request_id,turn_code,message)
 values(a.id,a.patient_id,r.id,auth.uid(),p_request_id,'T-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)), 'Es tu turno. Dirígete al '||r.name||'.') returning id into v_id;
 insert into public.box_call_events(call_id,actor_id,event) values(v_id,auth.uid(),'called');
 v_notification:=app_private.notify(a.patient_id,'box_call','Es tu turno','Es tu turno. Dirígete al '||r.name||'.',a.id,null,'box-call:'||v_id);
 update public.notifications set box_call_id=v_id where id=v_notification;
 perform app_private.log_event('box_called',a.slot_id,a.patient_id,a.id,'Llamado visual al box');
 return v_id;
end$$;
create or replace function public.get_box_calls(p_pending_only boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare u uuid;v_staff boolean;v_calls jsonb;begin
 u:=app_private.require_user();v_staff:=app_private.actor_role() in('admin','reception');
 if app_private.actor_role()='supervisor' then return '[]';end if;
 select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]') into v_calls from(
  select jsonb_build_object('id',c.id,'appointment_id',c.appointment_id,'room_id',c.room_id,'room_name',r.name,
   'turn_code',c.turn_code,'message',c.message,'status',c.status,'created_at',c.created_at,'received_at',c.received_at,'responded_at',c.responded_at,'closed_at',c.closed_at)
   ||case when v_staff then jsonb_build_object('patient_name',trim(p.full_name||' '||p.last_name)) else '{}'::jsonb end as item,c.created_at
  from public.box_calls c join public.rooms r on r.id=c.room_id join public.profiles p on p.id=c.patient_id
  join public.appointments a on a.id=c.appointment_id join public.slots s on s.id=a.slot_id
  where(v_staff or c.patient_id=u) and c.created_at>now()-interval '30 days'
   and(not coalesce(p_pending_only,true) or(c.closed_at is null and(v_staff or(c.status<>'understood' and a.status='arrived' and(s.starts_at at time zone 'America/Santiago')::date=(now() at time zone 'America/Santiago')::date))))
  order by c.created_at desc,c.id limit 100
 )q;return v_calls;
end$$;
create or replace function public.respond_box_call(p_id uuid,p_response text) returns void
language plpgsql security definer set search_path='' as $$declare u uuid;c public.box_calls;v_status text;begin
 u:=app_private.require_user();
 if p_response not in('received','understood','help') then raise exception 'La respuesta del llamado no es válida';end if;
 select * into c from public.box_calls where id=p_id for update;
 if not found or c.patient_id<>u then raise exception 'Solo puedes responder a tu propio llamado';end if;
 if c.closed_at is not null then raise exception 'El personal ya cerró este llamado';end if;
 v_status:=case when p_response='received' and c.status<>'pending' then c.status else p_response end;
 if c.status=v_status and c.received_at is not null then return;end if;
 update public.box_calls set status=v_status,received_at=coalesce(received_at,now()),responded_at=case when p_response in('understood','help') then now() else responded_at end where id=p_id;
 insert into public.box_call_events(call_id,actor_id,event) values(p_id,u,p_response);
 perform app_private.log_event('box_call_'||p_response,null,u,c.appointment_id,'Respuesta a llamado visual');
end$$;
create or replace function public.close_box_call(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare c public.box_calls;begin
 perform app_private.require_staff();select * into c from public.box_calls where id=p_id for update;
 if not found then raise exception 'No encontramos este llamado';end if;
 if c.closed_at is not null then return;end if;
 update public.box_calls set closed_at=now() where id=p_id;
 insert into public.box_call_events(call_id,actor_id,event) values(p_id,auth.uid(),'closed');
 perform app_private.log_event('box_call_closed',null,c.patient_id,c.appointment_id,'Llamado cerrado por el personal');
end$$;
create or replace function public.get_public_box_calls(p_room uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(q.item order by q.created_at desc),'[]') from(
  select jsonb_build_object('turn_code',c.turn_code,'room_name',r.name,'created_at',c.created_at,'status','calling') as item,c.created_at
  from public.box_calls c join public.rooms r on r.id=c.room_id join public.appointments a on a.id=c.appointment_id
  where c.closed_at is null and c.status<>'understood' and a.status='arrived' and c.created_at>now()-interval '15 minutes' and(p_room is null or c.room_id=p_room)
  order by c.created_at desc,c.id limit 20
 )q
$$;
create or replace function app_private.close_finished_box_calls() returns trigger
language plpgsql security definer set search_path='' as $$declare c public.box_calls;begin
 if new.status is distinct from old.status and new.status in('completed','cancelled','no_show') then
  for c in update public.box_calls set closed_at=now() where appointment_id=new.id and closed_at is null returning * loop
   insert into public.box_call_events(call_id,actor_id,event) values(c.id,auth.uid(),'appointment_closed');
  end loop;
 end if;return new;
end$$;
drop trigger if exists contigo_close_finished_box_calls on public.appointments;
create trigger contigo_close_finished_box_calls after update of status on public.appointments for each row execute function app_private.close_finished_box_calls();

-- Direct table access never exposes other authors' identifiers. Published
-- comments are obtained through the sanitized RPC, not a permissive table read.
do $$declare t text;begin foreach t in array array['room_comments','room_comment_reports','comment_moderation_terms','comment_moderation_actions','box_calls','box_call_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
end loop;end$$;
drop policy if exists comments_own_or_moderator on public.room_comments;
create policy comments_own_or_moderator on public.room_comments for select to authenticated using(author_id=(select auth.uid()) or(select app_private.actor_role())='admin');
drop policy if exists comment_reports_own_or_admin on public.room_comment_reports;
create policy comment_reports_own_or_admin on public.room_comment_reports for select to authenticated using(reporter_id=(select auth.uid()) or(select app_private.actor_role())='admin');
drop policy if exists moderation_terms_admin on public.comment_moderation_terms;
create policy moderation_terms_admin on public.comment_moderation_terms for select to authenticated using((select app_private.actor_role())='admin');
drop policy if exists moderation_actions_admin on public.comment_moderation_actions;
create policy moderation_actions_admin on public.comment_moderation_actions for select to authenticated using((select app_private.actor_role())='admin');
drop policy if exists calls_recipient_or_staff on public.box_calls;
create policy calls_recipient_or_staff on public.box_calls for select to authenticated using((patient_id=(select auth.uid()) and(select app_private.actor_role())<>'supervisor') or(select app_private.actor_role()) in('admin','reception'));
drop policy if exists call_events_recipient_or_staff on public.box_call_events;
create policy call_events_recipient_or_staff on public.box_call_events for select to authenticated using(exists(select 1 from public.box_calls c where c.id=call_id and((c.patient_id=(select auth.uid()) and(select app_private.actor_role())<>'supervisor') or(select app_private.actor_role()) in('admin','reception'))));

revoke all on function app_private.comment_normalize(text),app_private.comment_term_key(text),app_private.comment_status(text),app_private.comment_json(public.room_comments,uuid,boolean),app_private.close_finished_box_calls() from public,anon,authenticated;
revoke all on function public.get_room_comments(uuid,integer,integer),public.post_room_comment(uuid,text,uuid,text),public.edit_room_comment(uuid,text),public.withdraw_room_comment(uuid),public.report_room_comment(uuid,text),public.moderate_room_comment(uuid,text,text),public.get_comment_moderation(text,integer,integer),public.save_moderation_term(text,boolean,text),public.save_profile(text,text,text,jsonb),public.save_accessibility_preferences(jsonb),public.call_to_box(uuid,uuid),public.get_box_calls(boolean),public.respond_box_call(uuid,text),public.close_box_call(uuid),public.get_public_box_calls(uuid) from public,anon,authenticated;
grant execute on function public.get_room_comments(uuid,integer,integer),public.post_room_comment(uuid,text,uuid,text),public.edit_room_comment(uuid,text),public.withdraw_room_comment(uuid),public.report_room_comment(uuid,text),public.moderate_room_comment(uuid,text,text),public.get_comment_moderation(text,integer,integer),public.save_moderation_term(text,boolean,text),public.save_profile(text,text,text,jsonb),public.save_accessibility_preferences(jsonb),public.call_to_box(uuid,uuid),public.get_box_calls(boolean),public.respond_box_call(uuid,text),public.close_box_call(uuid) to authenticated;
grant execute on function public.get_public_box_calls(uuid) to anon,authenticated;

-- Supabase Realtime is an enhancement; the persisted RPC feed remains usable
-- when the publication is unavailable, disconnected, or unsupported locally.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='box_calls') then
  execute 'alter publication supabase_realtime add table public.box_calls';
 end if;
end$$;
commit;
