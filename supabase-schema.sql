-- Run this in your Supabase SQL editor

create table if not exists public.saved_albums (
  user_id text not null,
  album_id text not null,
  album_name text not null,
  artist_name text not null,
  images jsonb,
  spotify_url text,
  saved_at timestamptz,
  inserted_at timestamptz default now(),
  primary key (user_id, album_id)
);

-- Optional: index for faster user lookups
create index if not exists saved_albums_user_idx on public.saved_albums(user_id);

-- If you plan to call using anon key with RLS, you can add RLS policies.
-- For now we're using the service role key on the server, so RLS can remain off
-- or you can enable and add a broad policy for service role (which bypasses RLS anyway).

