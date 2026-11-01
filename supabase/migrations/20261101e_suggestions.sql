-- Suggestions and missing things, carried by BudguTee to PlanTee (the admin inbox)
create table if not exists suggestions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  name text, department_id int,
  kind text not null default 'idea',          -- idea | missing | problem
  body text not null check (length(body) between 2 and 2000),
  screen text, via text default 'form',       -- form | chat
  status text not null default 'new',         -- new | seen | done
  note text, created_at timestamptz default now());
alter table suggestions enable row level security;
create policy "sug insert own" on suggestions for insert to authenticated with check (user_id = auth.uid());
create policy "sug read own or admin" on suggestions for select to authenticated using (user_id = auth.uid() or current_role_() = 'admin');
create policy "sug admin update" on suggestions for update to authenticated using (current_role_() = 'admin');
