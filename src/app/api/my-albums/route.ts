import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Me = { id: string };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Derive Spotify user id from access token
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${(session as any).accessToken}` },
      cache: "no-store",
    });
    if (!meRes.ok) {
      const t = await meRes.text();
      return NextResponse.json(
        { error: `Spotify /me failed: ${meRes.status} ${t}` },
        { status: 500 }
      );
    }
    const me = (await meRes.json()) as Me;
    const spotifyUserId = me.id;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("saved_albums")
      .select("album_id, album_name, artist_name, images, spotify_url, saved_at")
      .eq("user_id", spotifyUserId)
      .order("saved_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ albums: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

