-- Exclusively fictitious registry. No auth.users/profiles/agenda writes.
-- Idempotent: preserve the currently stored simulation until an admin explicitly resets it.
insert into public.demonstration_sets(tag,template,payload,active)
select 'medicita-december-2026-v1',d,d,true
from (select app_private.build_demo_december_dataset('2026-11-24T12:00:00Z'::timestamptz) d) fixture
on conflict(tag) do nothing;
