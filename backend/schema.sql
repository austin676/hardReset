-- =============================================================================
-- schema.sql
-- Run this entire file in your Supabase SQL Editor:
--   Supabase Dashboard → SQL Editor → New Query → paste → Run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- rooms
-- Holds one row per active (or recently finished) game room.
-- ---------------------------------------------------------------------------
create table if not exists rooms (
  room_id           text        primary key,
  meeting_active    boolean     not null default false,
  game_active       boolean     not null default false,  -- true once startGame fires
  timer             integer     not null default 180,
  sabotage_stations jsonb       not null default '{}',
  round             integer     not null default 1,
  created_at        timestamptz not null default now()
);

-- Add game_active to existing installations (safe to run on a live DB)
alter table rooms add column if not exists game_active boolean not null default false;

-- ---------------------------------------------------------------------------
-- players
-- One row per connected player. Deleted automatically when the parent room
-- is deleted (cascade), and manually on disconnect.
-- ---------------------------------------------------------------------------
create table if not exists players (
  socket_id        text        primary key,
  room_id          text        not null references rooms(room_id) on delete cascade,
  name             text        not null,
  avatar           text        not null default 'default',
  role             text,                        -- null until game starts
  position_x       numeric     not null default 0,
  position_y       numeric     not null default 0,
  alive            boolean     not null default true,
  tasks_completed  integer     not null default 0,
  sabotage_points  integer     not null default 0,
  vote             text,                        -- socketId voted for, or 'skip'
  timeout_until    timestamptz          default null, -- null = free to move; set = movement blocked until this UTC timestamp
  joined_at        timestamptz not null default now()
);

-- Add timeout_until to existing installations (safe to run on a live DB)
alter table players add column if not exists timeout_until timestamptz default null;

-- Index for fast player lookups by room
create index if not exists idx_players_room_id on players(room_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The backend uses the service-role key which bypasses RLS.
-- Keeping RLS ON prevents accidental public exposure via the anon key.
-- ---------------------------------------------------------------------------
alter table rooms   enable row level security;
alter table players enable row level security;

-- No public policies — only the service-role key (backend) can read/write.
