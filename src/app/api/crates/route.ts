import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Session } from "next-auth";
import { randomUUID } from "crypto";

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

export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  const devUserId = process.env.DEV_SPOTIFY_USER_ID;
  const useBypass = !session?.accessToken && devUserId && process.env.NODE_ENV !== "production";
  try {
    const userId = useBypass
      ? (devUserId as string)
      : await getSpotifyUserId((session as SessionWithToken).accessToken as string);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("crates")
      .select("id, name, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ crates: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  const devUserId = process.env.DEV_SPOTIFY_USER_ID;
  const useBypass = !session?.accessToken && devUserId && process.env.NODE_ENV !== "production";
  try {
    const body = (await req.json()) as { name?: string; description?: string };
    const name = (body.name || "").trim();
    const description = (body.description || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const userId = useBypass
      ? (devUserId as string)
      : await getSpotifyUserId((session as SessionWithToken).accessToken as string);
    const supabase = getSupabaseAdmin();
    const id = randomUUID();
    const { data, error } = await supabase
      .from("crates")
      .insert({ id, user_id: userId, name, description })
      .select("id, name, description, created_at")
      .single();
    if (error) {
      // Unique violation (duplicate name per user)
      const pgErr = error as { code?: string };
      if (pgErr.code === "23505") {
        return NextResponse.json({ error: "Crate name already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ crate: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
