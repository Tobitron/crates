"use client";
import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type Album = {
  album_id: string;
  album_name: string;
  artist_name: string;
  images: { url: string; width: number; height: number }[];
  spotify_url?: string;
  saved_at?: string;
};

export default function Home() {
  const { data: session, status } = useSession();
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlbums = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/albums");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load albums");
      setAlbums(data.albums);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/save-albums", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save albums");
      alert(`Saved ${data.inserted} albums to Supabase`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-8 sm:p-12">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Spotify Saved Albums</h1>
        {status === "authenticated" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-80">{session?.user?.name}</span>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("spotify")}
            className="px-3 py-1.5 rounded bg-green-500 text-white hover:bg-green-600"
          >
            Sign in with Spotify
          </button>
        )}
      </header>

      {status === "authenticated" && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={loadAlbums}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load Saved Albums"}
          </button>
          <button
            onClick={saveToSupabase}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save to Supabase"}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 text-red-600">Error: {error}</div>
      )}

      {albums && albums.length > 0 && (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {albums.map((a) => (
            <li key={`${a.album_id}`} className="rounded border p-3 flex gap-3 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.images?.[a.images.length - 1]?.url || "/placeholder.png"}
                alt={a.album_name}
                className="w-16 h-16 object-cover rounded"
              />
              <div>
                <div className="font-medium">{a.album_name}</div>
                <div className="text-sm opacity-80">{a.artist_name}</div>
                {a.spotify_url && (
                  <a
                    href={a.spotify_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open in Spotify
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {status === "authenticated" && !albums && (
        <p className="opacity-80">Click Load Saved Albums to fetch your library.</p>
      )}
    </div>
  );
}
