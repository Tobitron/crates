Spotify Saved Albums — Next.js + NextAuth + Supabase

This app lets you sign in with Spotify, view your saved albums, and save them to a Supabase database.

Setup

1) Create a Spotify app
- Go to https://developer.spotify.com/dashboard and create an app
- Add redirect URI: `http://localhost:3000/api/auth/callback/spotify`
- Copy the Client ID and Client Secret

2) Create a Supabase project
- Create a new Supabase project at https://supabase.com/
- Open the SQL editor and run the contents of `supabase-schema.sql`
- Get your `Project URL`, `anon key`, and `service_role` key from Project Settings → API

3) Configure environment variables
- Copy `.env.local.example` to `.env.local` and fill in values:
  - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
  - `NEXTAUTH_SECRET`: any strong random string
  - `NEXTAUTH_URL`: `http://localhost:3000`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (optional here), and `SUPABASE_SERVICE_ROLE_KEY`

4) Run the app

```
npm install
npm run dev
```

Open http://localhost:3000 and sign in with Spotify. Click “Load Saved Albums” to view them, and “Save to Supabase” to store them in your database.

Key files
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth handler with Spotify provider
- `src/lib/auth.ts`: NextAuth options with token refresh
- `src/app/api/albums/route.ts`: Fetches your Spotify saved albums (with pagination)
- `src/app/api/save-albums/route.ts`: Fetches and upserts albums into Supabase
- `src/lib/supabaseAdmin.ts`: Server-side Supabase client (service role)
- `supabase-schema.sql`: SQL for the `saved_albums` table

Learn more
- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Docs](https://next-auth.js.org/)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
