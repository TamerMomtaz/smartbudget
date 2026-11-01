-- Budgootee: questions per person per day (the bot's function writes here; nobody else needs to)
create table if not exists bot_usage (user_id uuid not null, day date not null, n int not null default 0, primary key (user_id, day));
alter table bot_usage enable row level security;
