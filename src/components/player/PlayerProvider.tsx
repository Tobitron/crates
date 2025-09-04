"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Nullable<T> = T | null;

type TrackInfo = {
  name: string;
  artists: string;
  album: string;
  image: string;
};

type PlayerCtx = {
  // state
  ready: boolean;
  deviceId: Nullable<string>;
  active: boolean;
  paused: boolean;
  position: number; // ms
  duration: number; // ms
  volume: number; // 0..1
  current: Nullable<TrackInfo>;
  showBar: boolean;
  // actions
  playAlbum: (albumId: string) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVol: (v: number) => Promise<void>;
};

const Ctx = createContext<PlayerCtx | undefined>(undefined);

// Minimal types to avoid installing sdk typings
type PlaybackArtist = { name: string };
type PlaybackAlbum = { name?: string; images?: Array<{ url: string }> };
type PlaybackTrack = { name?: string; artists?: PlaybackArtist[]; album?: PlaybackAlbum };
type PlaybackState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window?: { current_track?: PlaybackTrack };
};

interface WebPlaybackPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  addListener(event: "ready", cb: (arg: { device_id: string }) => void): void;
  addListener(event: "not_ready", cb: (arg: unknown) => void): void;
  addListener(event: "player_state_changed", cb: (state: PlaybackState) => void): void;
}

type SpotifyNamespace = {
  Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void }) => WebPlaybackPlayer;
};

declare global {
  interface Window {
    Spotify?: SpotifyNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

async function fetchAccessToken(): Promise<string> {
  const res = await fetch("/api/spotify-token", { cache: "no-store" });
  if (!res.ok) throw new Error("Unauthorized");
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No token");
  return data.access_token;
}

function loadSDK(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve();
    const scriptId = "spotify-web-playback-sdk";
    if (document.getElementById(scriptId)) {
      const wait = () => (window.Spotify ? resolve() : setTimeout(wait, 50));
      wait();
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
  });
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<WebPlaybackPlayer | null>(null);
  const [deviceId, setDeviceId] = useState<Nullable<string>>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [current, setCurrent] = useState<Nullable<TrackInfo>>(null);
  const [showBar, setShowBar] = useState(false);

  // Setup SDK and player
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSDK();
        if (cancelled) return;
        const player = new window.Spotify!.Player({
          name: "Crates Player",
          getOAuthToken: async (cb: (t: string) => void) => {
            try {
              const t = await fetchAccessToken();
              cb(t);
            } catch {
              // ignore; user likely not authed
            }
          },
        });

        player.addListener("ready", ({ device_id }: { device_id: string }) => {
          setDeviceId(device_id);
          setReady(true);
        });

        player.addListener("not_ready", () => {
          setActive(false);
        });

        player.addListener("player_state_changed", (state: PlaybackState) => {
          if (!state) return;
          setPaused(state.paused);
          setPosition(state.position ?? 0);
          setDuration(state.duration ?? 0);
          const cur = state.track_window?.current_track;
          if (cur) {
            const info: TrackInfo = {
              name: cur.name || "",
              artists: (cur.artists || []).map((a) => a.name).join(", "),
              album: cur.album?.name || "",
              image: cur.album?.images?.[0]?.url || "",
            };
            setCurrent(info);
            setShowBar(true);
          }
          setActive(!state.paused);
        });

        playerRef.current = player;
        // Token might be null for a moment; connect anyway, Player will request via getOAuthToken
        await player.connect();
        // Set initial volume once connected
        try {
          await playerRef.current?.setVolume(0.5);
        } catch {}
      } catch (e) {
        console.error("Failed to init Spotify SDK", e);
      }
    })();
    return () => {
      cancelled = true;
      try {
        playerRef.current?.disconnect();
      } catch {}
    };
  }, []);

  // Progress ticker when playing
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setPosition((p) => Math.min(p + 1000, duration));
    }, 1000);
    return () => clearInterval(id);
  }, [paused, duration]);

  const transferPlayback = useCallback(async (token: string, devId: string) => {
    await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_ids: [devId], play: false }),
    });
  }, []);

  const playAlbum = useCallback(async (albumId: string) => {
    if (!deviceId) return;
    const token = await fetchAccessToken();
    // Ensure this web player is the active device, then start album
    await transferPlayback(token, deviceId);
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}` , {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ context_uri: `spotify:album:${albumId}` }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("Failed to start album:", res.status, t);
    } else {
      setShowBar(true);
      setPaused(false);
    }
  }, [deviceId, transferPlayback]);

  const togglePlay = useCallback(async () => {
    await playerRef.current?.togglePlay?.();
  }, []);

  const next = useCallback(async () => {
    await playerRef.current?.nextTrack?.();
  }, []);

  const previous = useCallback(async () => {
    await playerRef.current?.previousTrack?.();
  }, []);

  const seek = useCallback(async (ms: number) => {
    setPosition(ms);
    await playerRef.current?.seek?.(ms);
  }, []);

  const setVol = useCallback(async (v: number) => {
    setVolume(v);
    await playerRef.current?.setVolume?.(v);
  }, []);

  const value = useMemo<PlayerCtx>(() => ({
    ready,
    deviceId,
    active,
    paused,
    position,
    duration,
    volume,
    current,
    showBar,
    playAlbum,
    togglePlay,
    next,
    previous,
    seek,
    setVol,
  }), [ready, deviceId, active, paused, position, duration, volume, current, showBar, playAlbum, togglePlay, next, previous, seek, setVol]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
