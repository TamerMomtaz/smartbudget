-- The ratifier: a director's own reviewer. It proposes, the director decides.
-- 1) each director's rulebook, in their own words
create table if not exists ratifier_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  rule text not null check (length(rule) between 3 and 500),
  applies text,                                  -- where it applies (optional)
  source_ask_id uuid references asks(id) on delete set null,
  active boolean not null default true,
  fired int not null default 0,                  -- how many cards it has touched
  created_at timestamptz default now());
alter table ratifier_rules enable row level security;
drop policy if exists "rr own" on ratifier_rules;
create policy "rr own" on ratifier_rules for all to authenticated
  using (user_id = auth.uid() and current_role_() in ('director','admin'))
  with check (user_id = auth.uid() and current_role_() in ('director','admin'));

-- 2) who owns what: a machine, a line, an area, and the department it belongs to
create table if not exists ownership_map (
  id bigint generated always as identity primary key,
  item text not null check (length(item) between 2 and 200),
  words text,                                    -- other names for it, separated by commas (Arabic or English)
  department_id int not null references departments(id),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now());
alter table ownership_map enable row level security;
drop policy if exists "om read" on ownership_map;
create policy "om read" on ownership_map for select to authenticated using (current_role_() in ('director','admin'));
drop policy if exists "om write" on ownership_map;
create policy "om write" on ownership_map for all to authenticated
  using (current_role_() in ('director','admin')) with check (current_role_() in ('director','admin'));

-- 3) what the ratifier found on each card (kept so a second look costs nothing)
create table if not exists ratifier_runs (
  id bigint generated always as identity primary key,
  ask_id uuid not null references asks(id) on delete cascade,
  user_id uuid not null,
  lang text, model text, result jsonb not null, checks jsonb,
  tokens_in int, tokens_out int,
  created_at timestamptz default now());
create index if not exists rruns_ask on ratifier_runs(ask_id, user_id, created_at desc);
alter table ratifier_runs enable row level security;
drop policy if exists "rruns own" on ratifier_runs;
create policy "rruns own" on ratifier_runs for select to authenticated using (user_id = auth.uid());

-- 4) start the map from the cards that were already moved to their right department
insert into ownership_map (item, words, department_id, note, created_by)
select distinct on (a.id) a.title, null, a.department_id, 'From a card that was moved here' || coalesce(' (from ' || (e.detail->>'from') || ')', ''), null
from ask_events e join asks a on a.id = e.ask_id
where e.event = 'moved' and a.department_id is not null
  and not exists (select 1 from ownership_map m where m.item = a.title and m.department_id = a.department_id)
order by a.id, e.at desc;
