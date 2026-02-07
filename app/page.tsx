"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Authentication } from "@/components/Authentication";

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-black text-white font-mono">
      <h1 className="text-5xl font-bold tracking-tight">Asteroids</h1>
      <p className="text-lg text-zinc-400">
        Dodge the rocks. Survive as long as you can.
      </p>

      <Suspense
        fallback={
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        }
      >
        <Authentication>
          {() => (
            <button
              onClick={() => router.push("/asteroids")}
              className="mt-2 rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-transform hover:scale-105 active:scale-95"
            >
              Start Game
            </button>
          )}
        </Authentication>
      </Suspense>
    </div>
  );
}
