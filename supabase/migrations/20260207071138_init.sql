-- need pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- -----------------------
-- ROOMS
-- -----------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby','live','finished')),
  seed bigint not null default (floor(random() * 2147483647))::bigint,
  started_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------
-- ROOM PLAYERS (leaderboard + live state)
-- -----------------------
create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  is_alive boolean not null default true,
  score int not null default 0,
  last_update_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- for leaderboard HUD query
create index if not exists room_players_room_score_idx
  on public.room_players(room_id, score desc);

alter table public.room_players
  add constraint room_players_score_nonneg check (score >= 0);

-- =========================================================
-- REALTIME SETUP
-- =========================================================

-- log entire table for replication
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;

do $$
begin
  execute 'alter publication supabase_realtime add table public.rooms';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.room_players';
exception when duplicate_object then null;
end $$;

-- =========================================================
-- RLS (CLIENTS READ-ONLY, SERVER WRITES)
-- =========================================================

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

-- Helper: membership check without RLS recursion
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

-- Lock down the function a bit
revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

-- ---------- ROOMS SELECT ----------
create policy "rooms_select_if_member"
on public.rooms
for select
to authenticated
using (public.is_room_member(rooms.id));

-- Block direct writes from clients
revoke insert, update, delete on public.rooms from authenticated;

-- ---------- ROOM_PLAYERS SELECT ----------
create policy "room_players_select_if_member"
on public.room_players
for select
to authenticated
using (public.is_room_member(room_players.room_id));

-- Block direct writes from clients
revoke insert, update, delete on public.room_players from authenticated;