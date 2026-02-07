"use client";

import { useEffect, useRef } from "react";
import autoAnimate from "@formkit/auto-animate";

interface Player {
  user_id: string;
  email: string;
  score: number;
  is_alive: boolean;
}

export function PlayerHUD({
  players,
  currentUserId,
}: {
  players: Player[];
  currentUserId: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) autoAnimate(listRef.current, { duration: 300 });
  }, []);

  // Sort: alive first, then alphabetical
  const sorted = [...players].sort((a, b) => {
    if (a.is_alive !== b.is_alive) return a.is_alive ? -1 : 1;
    return a.email.localeCompare(b.email);
  });

  return (
    <div className="absolute bottom-4 right-4 w-56 font-mono z-10">
      <div className="rounded-xl border border-zinc-800 bg-black/80 backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-800">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
            Players
          </p>
        </div>
        <div ref={listRef} className="flex flex-col">
          {sorted.map((p) => (
            <div
              key={p.user_id}
              className={`flex items-center gap-2 px-3 py-1.5 transition-opacity ${
                p.is_alive ? "opacity-100" : "opacity-40"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                  p.is_alive ? "bg-green-400" : "bg-red-500"
                }`}
              />
              <span className="text-xs text-zinc-300 truncate flex-1">
                {p.email.split("@")[0]}
                {p.user_id === currentUserId && (
                  <span className="text-zinc-600"> (you)</span>
                )}
              </span>
              {!p.is_alive && (
                <span className="text-[10px] text-red-400/60">DEAD</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
