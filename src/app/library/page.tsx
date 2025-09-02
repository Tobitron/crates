"use client";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type Album = {
  album_id: string;
  album_name: string;
  artist_name: string;
  images: { url: string; width: number; height: number }[];
  spotify_url?: string;
  saved_at?: string;
  crate_id?: string | null;
};

export default function LibraryPage() {
  const { data: session, status } = useSession();
  const devBypass = process.env.NEXT_PUBLIC_DEV_BYPASS === "1";
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingCrate, setCreatingCrate] = useState(false);
  const [crateName, setCrateName] = useState("");
  const [crateDescription, setCrateDescription] = useState("");
  const [crateSubmitting, setCrateSubmitting] = useState(false);
  const [crateError, setCrateError] = useState<string | null>(null);
  const [crates, setCrates] = useState<Array<{ id: string; name: string }>>([]);
  const [assigning, setAssigning] = useState<string | null>(null); // album_id being assigned
  const [assignCrateId, setAssignCrateId] = useState<string>("");
  const [assignError, setAssignError] = useState<string | null>(null);

  // Auto-load saved albums from DB
  useEffect(() => {
    if (status === "loading") return;
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
  }, [status]);

  // Load crates list for selection
  useEffect(() => {
    let cancelled = false;
    const loadCrates = async () => {
      try {
        const res = await fetch("/api/crates", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && !cancelled) {
          const list: Array<{ id: string; name: string }> = Array.isArray(data.crates)
            ? data.crates
            : [];
          setCrates(list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch {}
    };
    loadCrates();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const submitCreateCrate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!crateName.trim()) {
      setCrateError("Name is required");
      return;
    }
    setCrateSubmitting(true);
    setCrateError(null);
    try {
      const res = await fetch("/api/crates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: crateName, description: crateDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create crate");
      setCreatingCrate(false);
      setCrateName("");
      setCrateDescription("");
    } catch (e: unknown) {
      setCrateError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCrateSubmitting(false);
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

  const openAssignModal = (albumId: string) => {
    setAssigning(albumId);
    setAssignCrateId("");
    setAssignError(null);
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigning) return;
    try {
      const res = await fetch("/api/album-crate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ album_id: assigning, crate_id: assignCrateId || null }),
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : await res.text();
      const msg = isJson ? (data as { error?: string }).error : (data as string);
      if (!res.ok) throw new Error(msg || "Failed to assign crate");
      setAlbums((prev) =>
        (prev || []).map((a) => (a.album_id === assigning ? { ...a, crate_id: assignCrateId || null } : a))
      );
      setAssigning(null);
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  const removeFromCrate = async (albumId: string) => {
    try {
      const res = await fetch(`/api/album-crate?album_id=${encodeURIComponent(albumId)}`, {
        method: "DELETE",
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : await res.text();
      const msg = isJson ? (data as { error?: string }).error : (data as string);
      if (!res.ok) throw new Error(msg || "Failed to remove from crate");
      setAlbums((prev) => (prev || []).map((a) => (a.album_id === albumId ? { ...a, crate_id: null } : a)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <div className="min-h-screen p-8 sm:p-12">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Library</h1>
        <a
          href="/"
          className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
        >
          Go to Crates
        </a>
      {status === "authenticated" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-80">{session?.user?.name}</span>
            <button
              onClick={() => setCreatingCrate(true)}
              className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Create Crate
            </button>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {devBypass && (
              <button
                onClick={() => setCreatingCrate(true)}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Create Crate
              </button>
            )}
            <button
              onClick={() => signIn("spotify")}
              className="px-3 py-1.5 rounded bg-green-500 text-white hover:bg-green-600"
            >
              Sign in with Spotify
            </button>
          </div>
        )}
      </header>

      {status === "authenticated" && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={saveToSupabase}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save to Supabase"}
          </button>
        </div>
      )}

      {error && <div className="mb-4 text-red-600">Error: {error}</div>}

      {albums && albums.length > 0 && (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {albums.map((a) => (
            <li key={`${a.album_id}`} className="relative rounded border p-3 flex gap-3 items-center">
              <div className="absolute top-2 right-2 flex items-center gap-2">
                {a.crate_id ? (
                  <>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {crates.find((c) => c.id === a.crate_id)?.name || "In Crate"}
                    </span>
                    <button
                      onClick={() => removeFromCrate(a.album_id)}
                      className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                    >
                      Remove from Crate
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openAssignModal(a.album_id)}
                    className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  >
                    Add to Crate
                  </button>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={(a.images && a.images[0]?.url) || "/placeholder.png"}
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

      {loading && <p className="opacity-80">Loading your saved albums…</p>}
      {!loading && albums && albums.length === 0 && (
        <p className="opacity-80">No saved albums found in your database.</p>
      )}

      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded bg-white dark:bg-neutral-900 p-5 shadow-xl">
            <h2 className="text-lg font-medium mb-3">Add to Crate</h2>
            <form onSubmit={submitAssign} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Choose crate</label>
                <select
                  value={assignCrateId}
                  onChange={(e) => setAssignCrateId(e.target.value)}
                  className="w-full rounded border px-3 py-2 bg-transparent"
                  required
                >
                  <option value="" disabled>
                    Select a crate
                  </option>
                  {crates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {assignError && <div className="text-sm text-red-600">{assignError}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigning(null)}
                  className="px-3 py-1.5 rounded border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {creatingCrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded bg-white dark:bg-neutral-900 p-5 shadow-xl">
            <h2 className="text-lg font-medium mb-3">Create Crate</h2>
            <form onSubmit={submitCreateCrate} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input
                  type="text"
                  value={crateName}
                  onChange={(e) => setCrateName(e.target.value)}
                  className="w-full rounded border px-3 py-2 bg-transparent"
                  placeholder="e.g. Road Trip"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Description</label>
                <textarea
                  value={crateDescription}
                  onChange={(e) => setCrateDescription(e.target.value)}
                  className="w-full rounded border px-3 py-2 bg-transparent"
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              {crateError && <div className="text-sm text-red-600">{crateError}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreatingCrate(false);
                    setCrateError(null);
                  }}
                  className="px-3 py-1.5 rounded border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={crateSubmitting}
                  className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {crateSubmitting ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
