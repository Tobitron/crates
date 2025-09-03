-- Run this in your Supabase SQL editor

create table if not exists public.saved_albums (
  user_id text not null,
  album_id text not null,
  album_name text not null,
  artist_name text not null,
  images jsonb,
  spotify_url text,
  release_year int,
  saved_at timestamptz,
  inserted_at timestamptz default now(),
  primary key (user_id, album_id)
);

-- Optional: index for faster user lookups
create index if not exists saved_albums_user_idx on public.saved_albums(user_id);

-- Backfill-safe: add release_year column if the table already existed
alter table public.saved_albums
  add column if not exists release_year int;

create index if not exists saved_albums_release_year_idx on public.saved_albums(release_year);

-- If you plan to call using anon key with RLS, you can add RLS policies.
-- For now we're using the service role key on the server, so RLS can remain off
-- or you can enable and add a broad policy for service role (which bypasses RLS anyway).

-- Crates (folders) table
create table if not exists public.crates (
  id uuid primary key,
  user_id text not null,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Ensure per-user unique crate names (optional but recommended)
create unique index if not exists crates_user_name_unique on public.crates(user_id, name);
create index if not exists crates_user_idx on public.crates(user_id);

-- Link saved albums to an optional crate (one crate per album)
alter table public.saved_albums
  add column if not exists crate_id uuid references public.crates(id) on delete set null;

create index if not exists saved_albums_crate_idx on public.saved_albums(crate_id);
