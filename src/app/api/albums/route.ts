import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Session } from "next-auth";

type SpotifyAlbum = {
  id: string;
  name: string;
  artists: { name: string }[];
  images: { url: string; width: number; height: number }[];
  external_urls: { spotify: string };
};

type SessionWithToken = Session & { accessToken?: string };

export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = session.accessToken as string;

  try {
    const items: Array<{ album: SpotifyAlbum; added_at: string }> = [];
    let url = "https://api.spotify.com/v1/me/albums?limit=50";
    // Paginate through all saved albums
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 0 },
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

    const albums = items.map((i) => {
      const a = i.album;
      return {
        album_id: a.id,
        album_name: a.name,
        artist_name: a.artists.map((x) => x.name).join(", "),
        images: a.images,
        spotify_url: a.external_urls?.spotify,
        saved_at: i.added_at,
      };
    });

    return NextResponse.json({ albums });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
