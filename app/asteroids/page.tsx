"use client";

import { useState } from "react";
import GameCanvas from "@/components/GameCanvas";

export default function AsteroidsPage() {
  const [started, setStarted] = useState(false);

  if (started) {
    return <GameCanvas seed={Date.now()} />;
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-black text-white font-mono">
      <h1 className="text-5xl font-bold tracking-tight">Asteroids</h1>
      <p className="text-lg text-zinc-400">Dodge the rocks. Survive as long as you can.</p>
      <button
        onClick={() => setStarted(true)}
        className="mt-4 rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-transform hover:scale-105 active:scale-95"
      >
        Start Game
      </button>
    </div>
  );
}
