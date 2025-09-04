import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SessionWithToken = Session & { accessToken?: string };

// Simple in-memory sliding window rate limiter per user+key
const rlStore = new Map<string, number[]>();
function rateLimit(userKey: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = rlStore.get(userKey) || [];
  const recent = arr.filter((t) => t > cutoff);
  if (recent.length >= limit) {
    rlStore.set(userKey, recent);
    return false;
  }
  recent.push(now);
  rlStore.set(userKey, recent);
  return true;
}
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
    // Production safety guard: do not allow DEV_SPOTIFY_USER_ID to exist in prod
    if (process.env.NODE_ENV === "production" && process.env.DEV_SPOTIFY_USER_ID) {
      return NextResponse.json(
        { error: "DEV_SPOTIFY_USER_ID must not be set in production" },
        { status: 500 }
      );
    }
    const body = (await req.json()) as { crate_id?: string | null; album_ids?: string[] };
    const crateId = (body.crate_id ?? null) as string | null;
    const albumIds = Array.isArray(body.album_ids) ? body.album_ids.filter((x) => typeof x === "string") : [];
    if (albumIds.length === 0) return NextResponse.json({ updated: 0 });

    if (!useBypass && (!session || !session.accessToken)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = useBypass
      ? (devUserId as string)
      : await getSpotifyUserId((session as SessionWithToken).accessToken as string);

    // Rate limit: max 10 batch updates per user per minute
    const ok = rateLimit(`batch:${userId}`, 10, 60_000);
    if (!ok) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }

    const supabase = getSupabaseAdmin();

    // Optional: verify crate belongs to user if provided
    if (crateId) {
      const { data: crate, error: crateErr } = await supabase
        .from("crates")
        .select("id, user_id")
        .eq("id", crateId)
        .single();
      if (crateErr) return NextResponse.json({ error: crateErr.message }, { status: 500 });
      if (!crate || crate.user_id !== userId) return NextResponse.json({ error: "Crate not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("saved_albums")
      .update({ crate_id: crateId })
      .eq("user_id", userId)
      .in("album_id", albumIds)
      .select("album_id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ updated: (data || []).length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
