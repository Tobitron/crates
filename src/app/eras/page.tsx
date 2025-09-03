"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Album = {
  album_id: string;
  album_name: string;
  artist_name: string;
  images: { url: string; width: number; height: number }[];
  spotify_url?: string;
  release_year?: number | null;
};

type YearKey = number | "Unknown";

export default function ErasPage() {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openYear, setOpenYear] = useState<YearKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/my-albums", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load albums");
        if (!cancelled) setAlbums(data.albums ?? []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<YearKey, Album[]>();
    for (const a of albums || []) {
      const key: YearKey = typeof a.release_year === "number" && Number.isFinite(a.release_year)
        ? a.release_year
        : "Unknown";
      const arr = map.get(key) || [];
      arr.push(a);
      map.set(key, arr);
    }
    // Sort years desc, Unknown last
    const sortedEntries = Array.from(map.entries()).sort((a, b) => {
      const [ka] = a;
      const [kb] = b;
      if (ka === "Unknown" && kb === "Unknown") return 0;
      if (ka === "Unknown") return 1;
      if (kb === "Unknown") return -1;
      return (kb as number) - (ka as number);
    });
    return sortedEntries;
  }, [albums]);

  return (
    <div className="min-h-screen p-8 sm:p-12">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Eras</h1>
        <div className="flex gap-2">
          <Link
            href="/"
            className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
          >
            Crates
          </Link>
          <Link
            href="/library"
            className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
          >
            Library
          </Link>
        </div>
      </header>

      {error && <div className="mb-4 text-red-600">Error: {error}</div>}
      {loading && <p className="opacity-80">Loading albums…</p>}

      {!loading && grouped.length === 0 && (
        <p className="opacity-80">No albums found.</p>
      )}

      <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {grouped.map(([year, list]) => (
          <li key={`${year}`} className="rounded border p-4">
            <button
              className="w-full text-left"
              onClick={() => setOpenYear(year)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-xl font-semibold">{year}</div>
                <div className="text-sm opacity-70">{list.length} album{list.length !== 1 ? "s" : ""}</div>
              </div>
              <div className="flex -space-x-2">
                {list.slice(0, 5).map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a.album_id}
                    src={(a.images && a.images[0]?.url) || "/placeholder.png"}
                    alt={a.album_name}
                    className="w-10 h-10 object-cover rounded border bg-white"
                  />
                ))}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {openYear !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-auto rounded bg-white dark:bg-neutral-900 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xl font-semibold">{openYear}</div>
              <button className="px-3 py-1.5 rounded border" onClick={() => setOpenYear(null)}>
                Close
              </button>
            </div>
            <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {(grouped.find(([y]) => y === openYear)?.[1] || []).map((a) => (
                <li key={a.album_id} className="rounded border p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={(a.images && a.images[0]?.url) || "/placeholder.png"}
                    alt={a.album_name}
                    className="w-full h-40 object-cover rounded mb-2"
                  />
                  <div className="font-medium">{a.album_name}</div>
                  <div className="text-sm opacity-80">{a.artist_name}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

