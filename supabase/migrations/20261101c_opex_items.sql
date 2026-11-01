-- keeps each running cost on a card (people, training, tools…) with its own fields
alter table asks add column if not exists opex_items jsonb;
