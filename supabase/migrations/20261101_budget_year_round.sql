-- year-round budget: lines (GL + funded CAPEX), AX actuals, spend requests. Applied 2026-11-01.
create or replace function can_see_dept(dep int) returns boolean language sql stable security definer set search_path=public as $$
  select case
    when current_role_() in ('admin','excom') then true
    when current_role_() = 'director' then dept_directorate(dep) = current_directorate()
    when current_role_() = 'head' then dep = current_department()
    else false end $$;

create table if not exists budget_lines (
  id bigserial primary key, fiscal_year int not null, department_id int not null references departments(id),
  kind text not null default 'gl' check (kind in ('gl','capex')), gl_code text, name text not null,
  amount numeric not null default 0, last_year numeric, ask_id uuid references asks(id), created_at timestamptz default now());
create table if not exists spend_actuals (
  id bigserial primary key, fiscal_year int not null, department_id int not null references departments(id),
  budget_line_id bigint references budget_lines(id), gl_code text, period date, amount numeric not null, description text,
  source_file text, uploaded_by uuid references profiles(id), uploaded_at timestamptz default now());
create table if not exists spend_requests (
  id bigserial primary key, fiscal_year int not null, department_id int not null references departments(id),
  budget_line_id bigint references budget_lines(id), title text not null, amount numeric not null check (amount > 0),
  status text not null default 'open' check (status in ('open','approved','rejected','booked')),
  requested_by uuid references profiles(id), decided_by uuid references profiles(id),
  note text, created_at timestamptz default now(), decided_at timestamptz);
alter table budget_lines enable row level security;
alter table spend_actuals enable row level security;
alter table spend_requests enable row level security;
create policy "bl read" on budget_lines for select to authenticated using (can_see_dept(department_id));
create policy "bl admin" on budget_lines for all to authenticated using (current_role_() = 'admin') with check (current_role_() = 'admin');
create policy "sa read" on spend_actuals for select to authenticated using (can_see_dept(department_id));
create policy "sa admin" on spend_actuals for all to authenticated using (current_role_() = 'admin') with check (current_role_() = 'admin');
create policy "sr read" on spend_requests for select to authenticated using (can_see_dept(department_id));
create policy "sr insert" on spend_requests for insert to authenticated with check (can_write_dept(department_id) and status = 'open' and requested_by = (select id from profiles where user_id = auth.uid()));
create policy "sr decide" on spend_requests for update to authenticated
  using (current_role_() = 'admin' or (current_role_() = 'director' and can_write_dept(department_id)))
  with check (current_role_() = 'admin' or (current_role_() = 'director' and can_write_dept(department_id)));
create policy "sr withdraw" on spend_requests for delete to authenticated using (status = 'open' and requested_by = (select id from profiles where user_id = auth.uid()));
create index if not exists bl_dep on budget_lines(fiscal_year, department_id);
create index if not exists sa_dep on spend_actuals(fiscal_year, department_id);
create index if not exists sr_dep on spend_requests(fiscal_year, department_id);

-- 2026-11-01 (later): departments write their own GL lines (until finance locks them); manual spending; GL catalogue
alter table budget_lines add column if not exists locked boolean not null default false;
alter table budget_lines add column if not exists created_by uuid references profiles(id);
alter table spend_actuals add column if not exists source text not null default 'ax' check (source in ('ax','manual'));
alter table spend_actuals add column if not exists request_id bigint references spend_requests(id) on delete set null;
alter table asks add column if not exists budget_line_id bigint references budget_lines(id) on delete set null;
create policy "bl dept insert" on budget_lines for insert to authenticated with check (can_write_dept(department_id) and not locked);
create policy "bl dept update" on budget_lines for update to authenticated using (can_write_dept(department_id) and not locked) with check (can_write_dept(department_id) and not locked);
create policy "bl dept delete" on budget_lines for delete to authenticated using (can_write_dept(department_id) and not locked);
create policy "sa manual insert" on spend_actuals for insert to authenticated with check (source = 'manual' and can_write_dept(department_id) and uploaded_by = (select id from profiles where user_id = auth.uid()));
create policy "sa manual delete" on spend_actuals for delete to authenticated using (source = 'manual' and uploaded_by = (select id from profiles where user_id = auth.uid()));
create table if not exists gl_catalog (code text primary key, name text not null, created_at timestamptz default now());
alter table gl_catalog enable row level security;
create policy "glc read" on gl_catalog for select to authenticated using (true);
create policy "glc admin" on gl_catalog for all to authenticated using (current_role_() = 'admin') with check (current_role_() = 'admin');

-- 2026-11-01: "neither" link on cards; finance YTD sheets (monthly plan, breakdown, snapshot date)
alter table public.asks add column if not exists link_none boolean not null default false;
alter table public.budget_lines add column if not exists monthly jsonb;
alter table public.budget_lines add column if not exists details jsonb;
alter table public.budget_lines add column if not exists note text;
alter table public.spend_actuals add column if not exists as_of date;
