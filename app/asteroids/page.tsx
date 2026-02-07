"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { PlayerHUD } from "@/components/PlayerHUD";
import GameCanvas from "@/components/GameCanvas";
import { Authentication } from "@/components/Authentication";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Room {
  id: string;
  code: string;
  status: string;
  seed: number;
  started_at: string | null;
}

interface Player {
  user_id: string;
  email: string;
  score: number;
  is_alive: boolean;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(body: Record<string, unknown>) {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// ── RoomLobby ────────────────────────────────────────────────────────────────

function RoomLobby({ user }: { user: User }) {
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [starting, setStarting] = useState(false);

  // Fetch players list from the API
  const fetchPlayers = async (roomId: string) => {
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "players", roomId }),
      });
      const data = await res.json();
      if (res.ok) setPlayers(data);
    } catch {
      // fail silently
    }
  };

  // Subscribe to realtime changes on the room and players
  const roomId = room?.id ?? null;
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchPlayers(roomId);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const createRoom = async () => {
    setLoading(true);
    setError(null);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      const { players: roomPlayers, ...roomData } = await apiFetch({
        type: "create",
        code,
        userId: user.id,
      });
      setRoom(roomData);
      setPlayers(roomPlayers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { players: roomPlayers, ...roomData } = await apiFetch({
        type: "join",
        code: joinCode.toUpperCase(),
        userId: user.id,
      });
      setRoom(roomData);
      setPlayers(roomPlayers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setLoading(false);
    }
  };

  const startRoom = async () => {
    if (!room) return;
    setStarting(true);

    try {
      const data = await apiFetch({ type: "start", roomId: room.id });
      setRoom(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start room");
      setStarting(false);
    }
  };

  // Report death to Supabase
  const onGameOver = useCallback(
    async (score: number) => {
      await apiFetch({
        type: "progress",
        roomId: room?.id,
        userId: user.id,
        score,
        isAlive: false,
      });
    },
    [room?.id, user.id]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  // Game is live — full-screen canvas with player HUD overlay
  if (room?.status === "live") {
    return (
      <div className="relative h-screen w-screen">
        <GameCanvas seed={room.seed} onGameOver={onGameOver} />
        <PlayerHUD players={players} currentUserId={user.id} />
      </div>
    );
  }

  // Room lobby — waiting for players / start
  if (room) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-black text-white font-mono">
        <h1 className="text-4xl font-bold tracking-tight">Room</h1>
        <p className="text-3xl tracking-widest text-zinc-200">{room.code}</p>
        <p className="text-sm text-zinc-500">Share this code with friends to join</p>

        <div className="mt-2 w-full max-w-xs">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2 text-center">
            Players ({players.length})
          </p>
          <div className="flex flex-col gap-1">
            {players.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2"
              >
                <span className="text-sm text-zinc-300 truncate">
                  {p.email}
                </span>
                {p.user_id === user.id && (
                  <span className="text-xs text-zinc-600 ml-2">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={startRoom}
          disabled={starting}
          className="mt-4 rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {starting ? "Starting..." : "Start Game"}
        </button>
        <button
          onClick={() => { setRoom(null); setPlayers([]); setMode("choose"); }}
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300 transition-colors"
        >
          Leave room
        </button>
      </div>
    );
  }

  // Join room form
  if (mode === "join") {
    return (
      <form onSubmit={joinRoom} className="flex flex-col items-center gap-4 w-full max-w-sm">
        <input
          type="text"
          placeholder="Enter room code"
          required
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-center text-white placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors tracking-widest text-xl uppercase"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
        <button
          type="button"
          onClick={() => { setMode("choose"); setError(null); }}
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300 transition-colors"
        >
          Back
        </button>
      </form>
    );
  }

  // Default: choose create or join
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={createRoom}
        disabled={loading}
        className="w-full rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
      >
        {loading ? "Creating..." : "Create Room"}
      </button>
      <button
        onClick={() => setMode("join")}
        disabled={loading}
        className="w-full rounded-full border border-zinc-700 px-8 py-3 text-lg font-semibold text-white transition-transform hover:scale-105 active:scale-95 hover:border-zinc-500"
      >
        Join Room
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AsteroidsPage() {
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
          {(user) => <RoomLobby user={user} />}
        </Authentication>
      </Suspense>
    </div>
  );
}
