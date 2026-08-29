-- FFMC/DMC/DC are stateful: a state advanced under one input regime carries that
-- regime's bias forever. Stamping the regime lets a resume reject foreign state
-- instead of silently inheriting it. Existing rows were built from daily extremes.
alter table public.fwi_state
  add column inputs text not null default 'daily_extremes';

create index fwi_state_inputs_idx on public.fwi_state (inputs);
