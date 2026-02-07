# Building a Battle Royale Game with Supabase and React

Code available: [[https://github.com/dotangad/rbh-supabase]]

---

## 1 — What is Supabase?

Supabase is an open-source Firebase alternative. It gives you a full backend out of the box — a Postgres database, authentication, realtime subscriptions, storage, and edge functions — all accessible through auto-generated APIs and client libraries.

The key difference from Firebase: **your data lives in a real Postgres database**. You write SQL, you own your data, and you can run the whole stack locally.

### Supabase features we use in this project

| Feature | What it does for us |
|---|---|
| **Auth** | Magic link email login — no passwords. Supabase handles the entire flow: sending the email, generating tokens, managing sessions. |
| **Database (Postgres)** | Two tables — `rooms` and `room_players` — storing game lobbies, player membership, scores, and alive/dead status. |
| **Row Level Security (RLS)** | Locks down the tables so clients can only *read* data for rooms they belong to. All writes go through a server-side API route using the service role key. |
| **Realtime** | Postgres Changes — clients subscribe to row-level changes on `rooms` and `room_players`. When a player joins or the room status changes, every connected client gets the update instantly via WebSocket. |
| **Supabase CLI** | Run the entire Supabase stack locally with Docker. Local Postgres, local Auth, local Realtime, local Studio dashboard — no cloud project needed during development. |

---

## 2 — Running Supabase Locally via the CLI

### Install the CLI

```bash
# macOS
brew install supabase/tap/supabase

# npm (any platform)
npx supabase --version
```

### Initialize a project

```bash
supabase init
```

This creates a `supabase/` directory in your project:

```
supabase/
  config.toml          ← all local config (ports, auth settings, etc.)
  migrations/          ← SQL migration files
  seed.sql             ← optional seed data
  templates/           ← email templates (magic link, invite, etc.)
```

### Start the local stack

```bash
supabase start
```

This spins up ~10 Docker containers:

- **Postgres** (port 54322) — your database
- **Auth (GoTrue)** (port 54321) — handles signups, logins, tokens
- **Realtime** — WebSocket server for Postgres Changes, Broadcast, and Presence
- **Studio** (port 54323) — a full web dashboard (like phpMyAdmin but modern)
- **Inbucket** (port 54324) — a local email inbox that catches all emails (magic links show up here!)
- **PostgREST** — auto-generated REST API from your Postgres schema
- **Storage** — file storage with S3-compatible API
- **Edge Runtime** — for Deno-based edge functions

When it finishes, it prints your local credentials:

```
API URL:   http://127.0.0.1:54321
anon key:  eyJ...
service_role key: eyJ...
Studio URL: http://127.0.0.1:54323
Inbucket URL: http://127.0.0.1:54324
```

> **Tip**: `supabase status` reprints these any time you need them.

### Other useful CLI commands

| Command | What it does |
|---|---|
| `supabase stop` | Shuts down all containers |
| `supabase db reset` | Drops the DB and re-runs all migrations + seeds |
| `supabase migration new <name>` | Creates a new timestamped `.sql` migration file |
| `supabase db diff --local` | Generates a migration from changes you made in Studio |
| `supabase gen types --local` | Generates TypeScript types from your database schema |

---

## 3 — Setting Up a Next.js Project

### Scaffold with the Supabase template

```bash
npx create-next-app@latest -e with-supabase my-app
cd my-app
```

The `-e with-supabase` flag pulls Supabase's official Next.js starter. It comes pre-configured with:

### What's included

**Supabase client utilities** — two client factories, one for the browser, one for the server:

```
lib/
  supabase/
    client.ts    ← browser client (uses createBrowserClient from @supabase/ssr)
    server.ts    ← server client (uses createServerClient, reads cookies)
```

The **browser client** (`client.ts`) is simple — it just needs the URL and anon key:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

The **server client** (`server.ts`) also handles cookies for auth session management in SSR:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}
```

**Environment variables** — the template expects:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
```

The first two are public (safe in the browser). The service role key is **secret** — it bypasses RLS and should only be used in server-side code.

**Key dependencies** added by the template:

- `@supabase/supabase-js` — the main client library
- `@supabase/ssr` — helpers for cookie-based auth in server-side rendered apps

---

## 4 — Authentication

Supabase Auth supports many strategies (email/password, OAuth, phone OTP, etc.). We use **magic links** — the user enters their email, gets a link, clicks it, and they're signed in. No password.

### How it works under the hood

1. User submits their email
2. Client calls `supabase.auth.signInWithOtp({ email })`
3. Supabase Auth (GoTrue) generates a token and sends an email with a confirmation URL
4. User clicks the link → redirected back to your app with a `code` query parameter
5. Client calls `supabase.auth.exchangeCodeForSession(code)` → gets a JWT session
6. Supabase stores the session in cookies (via `@supabase/ssr`) — the user is now authenticated

> **Local dev**: Supabase doesn't actually send emails locally. Instead, magic link emails show up in **Inbucket** at `http://127.0.0.1:54324`. You can also customize the email template — ours lives at `supabase/templates/magic_link.html`.

### The Authentication component

Our `Authentication.tsx` is a render-prop component. It handles the entire auth flow and, once the user is signed in, calls `children(user)`:

```tsx
<Authentication>
  {(user) => <RoomLobby user={user} />}
</Authentication>
```

Key parts of the component:

**1. Check for existing session on mount:**

```ts
supabase.auth.getUser().then(({ data: { user } }) => {
  setUser(user);
  setLoading(false);
});
```

**2. Exchange code if redirected back from magic link:**

```ts
const code = searchParams.get("code");
if (code) {
  supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
    if (!error && data.user) setUser(data.user);
  });
}
```

**3. Listen for auth state changes (login/logout from other tabs, token refresh):**

```ts
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (_event, session) => {
    setUser(session?.user ?? null);
  }
);
return () => subscription.unsubscribe();
```

**4. Send the magic link:**

```ts
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${window.location.origin}/` },
});
```

**5. Sign out:**

```ts
supabase.auth.signOut()
```

That's the entire auth implementation. No auth provider wrapper, no context — just one component that gates the game behind a login.

---

## 5 — Database: Tables, Replication & RLS

Everything lives in a single migration file: `supabase/migrations/20260207071138_init.sql`

### Tables

**`rooms`** — each row is a game lobby:

```sql
create table public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                        -- 6-char join code
  status     text not null default 'lobby'
    check (status in ('lobby','live','finished')),        -- state machine
  seed       bigint not null default (floor(random() * 2147483647))::bigint,
  started_at timestamptz,
  created_at timestamptz not null default now()
);
```

- `code` — the human-readable code players share to join (e.g. "A3F9KX")
- `status` — enforced via `CHECK` constraint: `lobby` → `live` → `finished`
- `seed` — random number used by the game engine so every player sees the same asteroids

**`room_players`** — join table linking users to rooms, plus game state:

```sql
create table public.room_players (
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  is_alive      boolean not null default true,
  score         int not null default 0,
  last_update_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  primary key (room_id, user_id)
);
```

- Composite primary key `(room_id, user_id)` — a player can only be in a room once
- `is_alive` + `score` — updated when a player dies, used for the leaderboard HUD
- Index on `(room_id, score desc)` for fast leaderboard queries

### Realtime (Postgres Replication)

To stream database changes to clients via WebSocket, we need to:

1. **Set replica identity to FULL** — so the `payload.new` object includes all columns (not just the primary key):

```sql
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
```

2. **Add tables to the `supabase_realtime` publication** — this tells Postgres to broadcast changes:

```sql
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
```

Without these two steps, Realtime subscriptions on these tables won't receive any events.

### Row Level Security (RLS)

RLS is Supabase's permission model. It's built into Postgres — every query is filtered by policies you define.

Our approach: **clients can only read, server writes everything.**

**Enable RLS:**

```sql
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
```

Once enabled, **no one can access anything** unless you explicitly create policies.

**Helper function** — checks if the current user is a member of a given room (using `auth.uid()` which Supabase populates from the JWT):

```sql
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer  -- runs with elevated privileges to avoid RLS recursion
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;
```

**SELECT policies** — you can only read rooms/players you belong to:

```sql
create policy "rooms_select_if_member"
  on public.rooms for select to authenticated
  using (public.is_room_member(rooms.id));

create policy "room_players_select_if_member"
  on public.room_players for select to authenticated
  using (public.is_room_member(room_players.room_id));
```

**Block all client writes:**

```sql
revoke insert, update, delete on public.rooms from authenticated;
revoke insert, update, delete on public.room_players from authenticated;
```

This means the browser client (using the anon key) can only SELECT. All inserts and updates go through our Next.js API route, which uses the **service role key** to bypass RLS.

---

## 6 — Backend Logic (API Route)

All game mutations go through a single Next.js API route: `app/api/rooms/route.ts`

### Why a server-side route?

Because we locked down the tables with RLS — clients can't write directly. The API route uses a **service role client** that bypasses RLS:

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // ← secret, server-only
);
```

### Actions

The route handles 5 action types via a single `POST` endpoint:

**`create`** — Create a room and join the creator:

```ts
const { data: room } = await supabaseAdmin
  .from("rooms")
  .insert({ code: body.code })
  .select()
  .single();

await supabaseAdmin.from("room_players").insert({
  room_id: room.id,
  user_id: body.userId,
});
```

**`join`** — Look up a room by code and add the player:

```ts
const { data: room } = await supabaseAdmin
  .from("rooms")
  .select("*")
  .eq("code", body.code)
  .single();

await supabaseAdmin.from("room_players").upsert({
  room_id: room.id,
  user_id: body.userId,
});
```

**`start`** — Flip the room to "live" with a fresh seed:

```ts
const { data: room } = await supabaseAdmin
  .from("rooms")
  .update({
    status: "live",
    started_at: new Date(Date.now() + 3000).toISOString(),
    seed: Math.floor(Math.random() * 2147483647),
  })
  .eq("id", body.roomId)
  .select()
  .single();
```

The `seed` is regenerated here — this is what makes every player's game instance deterministic and identical.

**`players`** — Return the player list with emails (for the HUD):

```ts
const { data: players } = await supabaseAdmin
  .from("room_players")
  .select("user_id, score, is_alive, created_at")
  .eq("room_id", roomId);

// Resolve emails via the Admin Auth API
const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
const emailMap = new Map(users.map(u => [u.id, u.email]));
```

**`progress`** — Update a player's score and alive status (called when someone dies):

```ts
await supabaseAdmin
  .from("room_players")
  .update({ score: body.score, is_alive: body.isAlive, last_update_at: new Date().toISOString() })
  .eq("room_id", body.roomId)
  .eq("user_id", body.userId);
```

### Pattern summary

```
Browser ──POST JSON──→ /api/rooms ──service role──→ Supabase Postgres
                                                         │
                                         (Realtime publication)
                                                         ↓
                                                    WebSocket push
                                                         ↓
Browser ←──postgres_changes event──────────── Supabase Realtime
```

The frontend calls the API route to mutate data. The API route writes to Postgres. Postgres broadcasts the change via Realtime. All subscribed clients receive the update.

---

## 7 — Frontend Logic (Realtime & the Game)

### Architecture overview

```
page.tsx (/)
  └─ Authentication
       └─ "Start Game" button → /asteroids

page.tsx (/asteroids)
  └─ Authentication
       └─ RoomLobby
            ├─ Create / Join room (API calls)
            ├─ Lobby view (Realtime subscriptions)
            └─ Game view
                 ├─ GameCanvas (canvas + engine)
                 └─ PlayerHUD (live leaderboard)
```

### Subscribing to Realtime (Postgres Changes)

Once a user is in a room, we subscribe to two channels:

```ts
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
      // Room status changed (e.g. lobby → live)
      setRoom(payload.new as Room);
    }
  )
  .on(
    "postgres_changes",
    {
      event: "*",             // INSERT, UPDATE, DELETE
      schema: "public",
      table: "room_players",
      filter: `room_id=eq.${roomId}`,
    },
    () => {
      // A player joined, died, or scored — refresh the player list
      fetchPlayers(roomId);
    }
  )
  .subscribe();
```

**How this powers the game flow:**

1. **Lobby**: Player A creates a room. Player B enters the code and joins. The `room_players` INSERT triggers Realtime → Player A's client fetches the updated player list and sees Player B appear.

2. **Start**: Player A clicks "Start Game". The API route updates `rooms.status` to `live`. The `rooms` UPDATE triggers Realtime → **all** clients receive the new room object with `status: "live"` and the shared `seed`.

3. **Game**: Both clients render `<GameCanvas seed={room.seed} />`. Because the seed is identical, the seeded PRNG produces the exact same sequence of asteroids on both screens. Players dodge independently.

4. **Death**: When a player hits an asteroid, `onGameOver(score)` fires → calls the `progress` API → updates `room_players` → triggers Realtime → all clients see the player go from alive to dead on the HUD.

### The Game Canvas

The `GameCanvas` component is minimal — it mounts a `<canvas>`, creates a `GameEngine` instance, and starts/stops it:

```tsx
useEffect(() => {
  const canvas = canvasRef.current!;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const engine = new GameEngine(canvas, seed, onGameOver);
  engine.start();

  return () => engine.stop();
}, [seed, onGameOver]);
```

No game state in React. The engine owns everything and runs at 60fps via `requestAnimationFrame`. React just mounts/unmounts it.

### The Player HUD

A floating overlay that shows all players in the room — sorted alive-first, with a green/red status dot:

```tsx
<PlayerHUD players={players} currentUserId={user.id} />
```

It updates in real time because the parent component re-fetches the player list whenever a `postgres_changes` event fires on `room_players`.

### The Seeded RNG trick

The key insight for "multiplayer without syncing game state": if every client starts with the same seed, the asteroids spawn in the same positions, at the same sizes, moving in the same directions. The only variable is player input (steering). So we don't need to sync asteroid positions over the network — just the seed (once, at game start) and player outcomes (alive/dead + score, at game end).

```
Server: "seed = 1234567, game starts at T+3s"
   ↓ (Realtime)
Client A: GameEngine(canvas, 1234567) → identical asteroids
Client B: GameEngine(canvas, 1234567) → identical asteroids
```

---

## Recap

| Layer | Tech | What it does |
|---|---|---|
| **Auth** | Supabase Auth (magic links) | Passwordless login |
| **Database** | Supabase Postgres | Rooms, players, scores |
| **Permissions** | RLS + service role | Read-only clients, server writes |
| **Realtime** | Postgres Changes (WebSocket) | Live lobby + leaderboard updates |
| **Backend** | Next.js API route | Mutations via service role client |
| **Frontend** | React + Canvas | Lobby UI + game engine |
| **Multiplayer sync** | Seeded PRNG | Same seed = same game for everyone |
