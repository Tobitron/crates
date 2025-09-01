import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Session } from "next-auth";

type SpotifyAlbum = {
  id: string;
  name: string;
  artists: { name: string }[];
  images: { url: string; width: number; height: number }[];
  external_urls: { spotify: string };
};

type SessionWithToken = Session & { accessToken?: string };

export async function POST() {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.accessToken as string;

  try {
    // Get Spotify profile for stable user ID
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!meRes.ok) {
      const t = await meRes.text();
      return NextResponse.json(
        { error: `Spotify /me failed: ${meRes.status} ${t}` },
        { status: 500 }
      );
    }
    const me = (await meRes.json()) as { id: string };
    const spotifyUserId = me.id;

    // Fetch all saved albums (reuse pagination logic inline)
    const items: Array<{ album: SpotifyAlbum; added_at: string }> = [];
    let url = "https://api.spotify.com/v1/me/albums?limit=50";
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          { error: `Spotify request failed: ${res.status} ${err}` },
          { status: 500 }
        );
      }
      const data = (await res.json()) as {
        items: Array<{ album: SpotifyAlbum; added_at: string }>;
        next: string | null;
      };
      items.push(...(data.items || []));
      url = data.next || "";
    }

    const rows = items.map((i) => {
      const a = i.album;
      return {
        user_id: spotifyUserId,
        album_id: a.id,
        album_name: a.name,
        artist_name: a.artists.map((x) => x.name).join(", "),
        images: a.images,
        spotify_url: a.external_urls?.spotify,
        saved_at: i.added_at,
      };
    });

    if (rows.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }

    // Upsert into Supabase
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("saved_albums")
      .upsert(rows, { onConflict: "user_id,album_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: rows.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
