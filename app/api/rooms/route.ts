import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service-role client to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Action =
  | { type: "create"; code: string; userId: string }
  | { type: "join"; code: string; userId: string }
  | { type: "start"; roomId: string }
  | { type: "players"; roomId: string }
  | { type: "progress"; roomId: string; userId: string; score: number; isAlive: boolean };

async function getPlayersWithEmails(roomId: string) {
  const { data: players, error } = await supabaseAdmin
    .from("room_players")
    .select("user_id, score, is_alive, created_at")
    .eq("room_id", roomId);
  if (error) throw error;

  const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
  if (usersError) throw usersError;

  const emailMap = new Map(users.map((u) => [u.id, u.email]));
  return players.map((p) => ({
    ...p,
    email: emailMap.get(p.user_id) ?? "Unknown",
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Action;

    // ---------------- CREATE ROOM ----------------
    if (body.type === "create") {
      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .insert({ code: body.code })
        .select()
        .single();
      if (error) throw error;

      await supabaseAdmin.from("room_players").insert({
        room_id: room.id,
        user_id: body.userId,
      });

      const players = await getPlayersWithEmails(room.id);
      return NextResponse.json({ ...room, players });
    }

    // ---------------- JOIN ROOM ----------------
    if (body.type === "join") {
      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .select("*")
        .eq("code", body.code)
        .single();
      if (error) throw error;

      await supabaseAdmin.from("room_players").upsert({
        room_id: room.id,
        user_id: body.userId,
      });

      const players = await getPlayersWithEmails(room.id);
      return NextResponse.json({ ...room, players });
    }

    // ---------------- START ROOM ----------------
    if (body.type === "start") {
      const startTime = new Date(Date.now() + 3000).toISOString();

      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .update({
          status: "live",
          started_at: startTime,
          seed: Math.floor(Math.random() * 2147483647),
        })
        .eq("id", body.roomId)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json(room);
    }

    // ---------------- LIST PLAYERS ----------------
    if (body.type === "players") {
      const players = await getPlayersWithEmails(body.roomId);
      return NextResponse.json(players);
    }

    // ---------------- GAME PROGRESS ----------------
    if (body.type === "progress") {
      const { error } = await supabaseAdmin
        .from("room_players")
        .update({
          score: body.score,
          is_alive: body.isAlive,
          last_update_at: new Date().toISOString(),
        })
        .eq("room_id", body.roomId)
        .eq("user_id", body.userId);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}