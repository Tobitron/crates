"use client";
import React, { useState } from "react";
import { usePlayer } from "@/components/player/PlayerProvider";

function msToMinSec(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const { showBar, current, paused, position, duration, volume, togglePlay, next, previous, seek, setVol } = usePlayer();
  const [scrub, setScrub] = useState<number | null>(null);
  const pos = scrub ?? position;

  if (!showBar || !current) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-black text-white px-4 py-2 shadow-[0_-2px_8px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-4">
        {/* Left: art + titles */}
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.image || "/placeholder.png"} alt="album art" className="w-10 h-10 rounded object-cover" />
          <div className="truncate">
            <div className="truncate">{current.name}</div>
            <div className="text-sm opacity-80 truncate">{current.artists}</div>
          </div>
        </div>

        {/* Middle: controls + progress */}
        <div className="flex-1 flex flex-col items-center gap-2">
          <div className="flex items-center gap-4">
            <button onClick={previous} className="opacity-80 hover:opacity-100" aria-label="Previous">⏮</button>
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95"
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? "▶" : "❚❚"}
            </button>
            <button onClick={next} className="opacity-80 hover:opacity-100" aria-label="Next">⏭</button>
          </div>
          <div className="w-full flex items-center gap-3">
            <div className="text-xs tabular-nums opacity-80 w-10 text-right">{msToMinSec(pos)}</div>
            <input
              className="flex-1 h-1.5 accent-white"
              type="range"
              min={0}
              max={duration || 0}
              step={500}
              value={pos}
              onChange={(e) => setScrub(Number(e.target.value))}
              onMouseUp={() => {
                if (scrub != null) seek(scrub);
                setScrub(null);
              }}
              onTouchEnd={() => {
                if (scrub != null) seek(scrub);
                setScrub(null);
              }}
            />
            <div className="text-xs tabular-nums opacity-80 w-10">{msToMinSec(duration)}</div>
          </div>
        </div>

        {/* Right: volume */}
        <div className="hidden sm:flex items-center gap-2 min-w-[140px] justify-end">
          <span className="opacity-80">🔉</span>
          <input
            className="w-28 h-1.5 accent-white"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => setVol(Number(e.target.value) / 100)}
          />
        </div>
      </div>
    </div>
  );
}
