-- A card the room marks green becomes a CAPEX line in its department's budget for the cycle's year.
-- Moving it off green removes that line again, unless the line has been locked.
create unique index if not exists bl_ask on budget_lines(ask_id) where ask_id is not null;

create or replace function sync_green_ask() returns trigger language plpgsql security definer set search_path = public as $$
declare y int;
begin
  select coalesce(nullif(substring(name from '(20[0-9]{2})'), '')::int, extract(year from now())::int + 1) into y from cycles where id = new.cycle_id;
  if new.status = 'green' then
    insert into budget_lines (fiscal_year, department_id, kind, name, amount, ask_id, note, created_by)
    values (y, new.department_id, 'capex', new.title, coalesce(new.capex_amount, 0), new.id, 'Approved in the room', new.owner_id)
    on conflict (ask_id) where ask_id is not null do update
      set name = excluded.name, amount = excluded.amount, department_id = excluded.department_id, fiscal_year = excluded.fiscal_year
      where not budget_lines.locked;
  elsif tg_op = 'UPDATE' and old.status = 'green' then
    delete from budget_lines where ask_id = new.id and not locked;
  end if;
  return new;
end $$;

drop trigger if exists asks_green_budget on asks;
create trigger asks_green_budget after insert or update of status, capex_amount, title, department_id on asks
  for each row execute function sync_green_ask();
