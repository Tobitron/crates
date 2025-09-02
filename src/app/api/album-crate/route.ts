import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Session } from "next-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SessionWithToken = Session & { accessToken?: string };

async function getSpotifyUserId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Spotify /me failed: ${res.status} ${t}`);
  }
  const me = (await res.json()) as { id: string };
  return me.id;
}

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  const devUserId = process.env.DEV_SPOTIFY_USER_ID;
  const useBypass = !session?.accessToken && devUserId && process.env.NODE_ENV !== "production";
  try {
    const body = (await req.json()) as { album_id?: string; crate_id?: string | null };
    const albumId = (body.album_id || "").trim();
    const crateId = body.crate_id ?? null;
    if (!albumId) return NextResponse.json({ error: "album_id is required" }, { status: 400 });

    const userId = useBypass
      ? (devUserId as string)
      : await getSpotifyUserId((session as SessionWithToken).accessToken as string);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("saved_albums")
      .update({ crate_id: crateId })
      .eq("user_id", userId)
      .eq("album_id", albumId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  // For remove-from-crate convenience; same as POST with crate_id null
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  const devUserId = process.env.DEV_SPOTIFY_USER_ID;
  const useBypass = !session?.accessToken && devUserId && process.env.NODE_ENV !== "production";
  try {
    const { searchParams } = new URL(req.url);
    const albumId = (searchParams.get("album_id") || "").trim();
    if (!albumId) return NextResponse.json({ error: "album_id is required" }, { status: 400 });

    const userId = useBypass
      ? (devUserId as string)
      : await getSpotifyUserId((session as SessionWithToken).accessToken as string);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("saved_albums")
      .update({ crate_id: null })
      .eq("user_id", userId)
      .eq("album_id", albumId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

