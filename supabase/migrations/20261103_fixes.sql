-- smartBudget fixes, 2026-11-03. Paste all of it in Supabase → SQL Editor → Run.

-- 1) ExCom can record the room's decision (Pitched / Green / Yellow / Gate)
drop policy if exists "asks excom decide" on asks;
create policy "asks excom decide" on asks for update to authenticated
  using (current_role_() = 'excom' and status::text in ('submitted','pitched','green','yellow','gate'))
  with check (current_role_() = 'excom' and status::text in ('submitted','pitched','green','yellow','gate'));

-- 2) Safety warning: fix the search path of touch_updated_at
alter function touch_updated_at() set search_path = public;

-- 3) Remove the duplicate profile with the e-mail typo (".co" instead of ".com")
delete from profiles where email = 'mohamed.abdelrazik@almanargroup.co';
delete from auth.users where email = 'mohamed.abdelrazik@almanargroup.co';
