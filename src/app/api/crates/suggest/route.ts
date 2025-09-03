import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
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

async function fetchAlbumsArtists(
  albumIds: string[],
  accessToken: string
): Promise<Map<string, string[]>> {
  // Returns map album_id -> array of artist_ids
  const result = new Map<string, string[]>();
  const chunkSize = 20; // Spotify allows up to 20 ids per /albums call
  for (let i = 0; i < albumIds.length; i += chunkSize) {
    const chunk = albumIds.slice(i, i + chunkSize);
    const url = `https://api.spotify.com/v1/albums?ids=${encodeURIComponent(chunk.join(","))}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      albums?: Array<{ id: string; artists?: Array<{ id: string }> }>;
    };
    (data.albums || []).forEach((a) => {
      const ids = (a.artists || []).map((ar) => ar.id).filter(Boolean);
      result.set(a.id, ids);
    });
  }
  return result;
}

async function fetchArtistsGenres(
  artistIds: string[],
  accessToken: string
): Promise<Map<string, string[]>> {
  // Returns map artist_id -> genres[]
  const result = new Map<string, string[]>();
  const uniqueIds = Array.from(new Set(artistIds));
  const chunkSize = 50; // Spotify allows up to 50 ids per /artists call
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const url = `https://api.spotify.com/v1/artists?ids=${encodeURIComponent(chunk.join(","))}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      artists?: Array<{ id: string; genres?: string[] }>;
    };
    (data.artists || []).forEach((a) => {
      result.set(a.id, (a.genres || []).slice(0, 5));
    });
  }
  return result;
}

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  const devUserId = process.env.DEV_SPOTIFY_USER_ID;
  const useBypass = !session?.accessToken && devUserId && process.env.NODE_ENV !== "production";

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set on the server" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      crate_id?: string;
      limit?: number;
      offset?: number;
      exclude_album_ids?: string[];
    };
    const crateId = (body.crate_id || "").trim();
    const limit = Math.max(1, Math.min(500, body.limit ?? 500));
    const offset = Math.max(0, Math.min(5000, body.offset ?? 0));
    const excludeList = Array.isArray(body.exclude_album_ids)
      ? body.exclude_album_ids.filter((x): x is string => typeof x === "string")
      : [];
    if (!crateId) {
      return NextResponse.json({ error: "crate_id is required" }, { status: 400 });
    }

    if (!useBypass && (!session || !session.accessToken)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = useBypass
      ? (devUserId as string)
      : await getSpotifyUserId((session as SessionWithToken).accessToken as string);

    const supabase = getSupabaseAdmin();

    // Get crate details and verify ownership
    const { data: crate, error: crateErr } = await supabase
      .from("crates")
      .select("id, user_id, name, description")
      .eq("id", crateId)
      .single();
    if (crateErr) return NextResponse.json({ error: crateErr.message }, { status: 500 });
    if (!crate || crate.user_id !== userId) {
      return NextResponse.json({ error: "Crate not found" }, { status: 404 });
    }

    // Candidate albums: unassigned albums for this user
    const { data: candidatesRaw, error: candErr } = await supabase
      .from("saved_albums")
      .select("album_id, album_name, artist_name, release_year")
      .eq("user_id", userId)
      .is("crate_id", null)
      .order("saved_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });

    const excluded = new Set(excludeList);
    const candidates = (candidatesRaw || []).filter((c) => !excluded.has(c.album_id));

    if (candidates.length === 0) {
      return NextResponse.json({ suggestions: [], candidates_count: 0 });
    }

    // Build compact lines for the LLM
    // Attempt to enrich with artist genres using the user's Spotify access token (if available)
    let genresByAlbum = new Map<string, string[]>();
    if (!useBypass && session?.accessToken) {
      try {
        const albumIds = candidates.map((c) => c.album_id);
        const artistsByAlbum = await fetchAlbumsArtists(albumIds, session.accessToken);
        const allArtistIds: string[] = [];
        artistsByAlbum.forEach((arr) => allArtistIds.push(...arr));
        const genresByArtist = await fetchArtistsGenres(allArtistIds, session.accessToken);
        // Merge artists' genres per album
        genresByAlbum = new Map(
          Array.from(artistsByAlbum.entries()).map(([albId, artistIds]) => {
            const gset = new Set<string>();
            artistIds.forEach((aid) => {
              (genresByArtist.get(aid) || []).forEach((g) => gset.add(g));
            });
            // Keep the first 5 genres for brevity
            return [albId, Array.from(gset).slice(0, 5)];
          })
        );
      } catch {
        // If enrichment fails, proceed without genres
      }
    }

    const lines = candidates.map((c) => {
      const genres = genresByAlbum.get(c.album_id);
      const genrePart = genres && genres.length > 0 ? ` [genres: ${genres.join("; ")}]` : "";
      return (
        `${c.album_id} | ${c.album_name} — ${c.artist_name}` +
        (c.release_year ? ` (${c.release_year})` : "") +
        genrePart
      );
    });

    const sys = `You are an expert music curator. Your task is view a list of album names, and decide which ones could reasonably fit into the genre provided.\n\nRules:\n- Output valid JSON only.\n- Prefer high precision (fewer false positives).\n- Return at most 30 suggestions.\n- Provide a score between 0 and 1 and a short reason.\n- Only include album_ids from the candidate list.\n- Do not invent ids.`;

    // Optional hint: list of ids to avoid (client also filters)
    const excludedNote = excludeList.length > 0
      ? `\nAvoid suggesting these album_ids (already reviewed): ${excludeList.join(",")}`
      : "";

    const model = process.env.OPENAI_MODEL || "gpt-5-nano";
    const messages = [
      { role: "system", content: sys },
      {
        role: "user",
        content:
          `Genre to match: ${crate.name}\n` +
          `Context: ${crate.description || "(none)"}\n\n` +
          `Candidates (format: album_id | title — artist (year) [genres: g1; g2; ...]):\n` +
          lines.join("\n") +
          `${excludedNote}` +
          `\n\nReturn JSON: {"suggestions": [{"album_id": "...", "score": 0.0, "reason": "..."}]}`,
      },
    ] as const;

    const payload: Record<string, unknown> = {
      model,
      response_format: { type: "json_object" },
      messages,
    };
    // Some models (e.g., gpt-5-nano) only support default temperature.
    // Only include temperature when supported.
    if (model !== "gpt-5-nano") {
      payload.temperature = 0.0;
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    type ChatResponse = {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const respJson: ChatResponse = (await resp.json()) as unknown as ChatResponse;
    if (!resp.ok) {
      const msg = respJson?.error?.message || `OpenAI error ${resp.status}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const content: string = respJson?.choices?.[0]?.message?.content || "{}";
    let parsed: { suggestions?: Array<{ album_id: string; score?: number; reason?: string }> } = {};
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return NextResponse.json({ error: "LLM returned non-JSON content" }, { status: 500 });
    }

    const candidateSet = new Set((candidates || []).map((c) => c.album_id));
    const suggestions = (parsed.suggestions || [])
      .filter((s) => s && typeof s.album_id === "string" && candidateSet.has(s.album_id))
      .slice(0, 30);

    // Enrich with album info for display
    const infoById = new Map((candidates || []).map((c) => [c.album_id, c] as const));
    const enriched = suggestions.map((s) => ({
      album_id: s.album_id,
      score: typeof s.score === "number" ? s.score : undefined,
      reason: s.reason || undefined,
      album_name: infoById.get(s.album_id)?.album_name || "",
      artist_name: infoById.get(s.album_id)?.artist_name || "",
      release_year: infoById.get(s.album_id)?.release_year ?? null,
    }));

    return NextResponse.json({ suggestions: enriched, candidates_count: candidates.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
