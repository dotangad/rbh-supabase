# Asteroids — Canvas Survival Game

A ship dodges asteroids. You survive as long as you can. Score = seconds alive.

The ship flies on autopilot (small random turns + constant drift). Asteroids spawn from the edges and float across the screen. Hit one and you're dead. Difficulty ramps over time: more asteroids, moving faster.

All rendering happens on a single `<canvas>`. No HUD, no overlays — just the game.

---

## Architecture

Two layers, that's it:

1. **React component** (`GameCanvas.tsx`) — mounts a `<canvas>`, creates the engine in a `useRef`, starts/stops it in a `useEffect`. No game state lives in React.
2. **Engine class** (`engine.ts`) — owns all game state, runs the `requestAnimationFrame` loop, updates positions, checks collisions, draws everything. Plain TypeScript, no React imports.

This keeps React out of the hot path. The engine does 60fps work; React just mounts and unmounts it.

---

## Files

```
src/
  app/asteroids/page.tsx          ← Next.js route, renders <GameCanvas />
  components/GameCanvas.tsx       ← "use client", canvas ref, mounts engine
  game/engine.ts                  ← GameEngine class (state, loop, update, draw)
```

Three files. That's the whole thing.

Types live at the top of `engine.ts` — no separate types file for a game this small.

---

## Game rules

- **Ship**: a triangle. Starts at center of canvas. Moves forward at constant speed. Turns slightly each frame (random via seeded RNG). Wraps around screen edges.
- **Asteroids**: circles of varying size. Spawn outside the canvas edges and drift inward at random angles. Also wrap around edges.
- **Collision**: circle-vs-circle. Ship has a collision radius. If `distance(ship, asteroid) < ship.radius + asteroid.radius` → game over.
- **Scoring**: `floor(elapsedSeconds)`. Drawn on canvas.
- **Difficulty**: every N seconds (e.g. 10), spawn rate goes up and asteroid speed multiplier increases.

No shooting, no lives, no powerups. Just dodge.

---

## Engine API

```ts
class GameEngine {
  constructor(canvas: HTMLCanvasElement, seed: number)
  start(): void    // begins the rAF loop
  stop(): void     // cancels the rAF loop
  resize(w: number, h: number): void
}
```

That's the entire public surface. The component calls `new GameEngine(canvas, seed)`, then `engine.start()`, and `engine.stop()` on cleanup.

---

## Seeded RNG

Use `mulberry32` — it's a one-liner PRNG that takes a seed and returns a function that produces deterministic floats in `[0, 1)`.

```ts
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

The engine stores `this.rng = mulberry32(seed)` and calls `this.rng()` wherever it needs randomness (spawn positions, asteroid sizes, ship turning). Given the same seed, the game plays out identically — this matters later for multiplayer.

---

## Game loop

Standard `requestAnimationFrame` pattern:

```ts
private loop = (now: number) => {
  const dt = Math.min((now - this.lastTime) / 1000, 0.05); // seconds, capped
  this.lastTime = now;

  this.update(dt);
  this.draw();

  this.rafId = requestAnimationFrame(this.loop);
};
```

The `0.05` cap prevents physics explosions when the tab loses focus and comes back with a huge delta.

---

## Update step

Each frame:

1. **Move ship**: advance position by `velocity * dt`. Apply small random heading change.
2. **Spawn asteroids**: check elapsed time against spawn timer. When it fires, create a new asteroid at a random edge position with a velocity aimed roughly inward.
3. **Move asteroids**: advance each asteroid's position by its `velocity * dt`.
4. **Wrap positions**: anything that goes off one edge reappears on the opposite edge.
5. **Check collisions**: loop through asteroids, check distance to ship. If collision → set `alive = false`.
6. **Cull asteroids**: remove any that have been off-screen for too long (optional, keeps the array from growing forever).

---

## Draw step

Each frame:

1. `ctx.clearRect(0, 0, w, h)` — black background.
2. Draw each asteroid as a filled circle (white or gray).
3. Draw the ship as a filled triangle pointing in its heading direction.
4. Draw the score as white text in a corner (just `ctx.fillText`).

If `alive === false`, draw "GAME OVER" centered on canvas.

---

## React component

```tsx
"use client";
import { useRef, useEffect } from "react";
import { GameEngine } from "@/game/engine";

export default function GameCanvas({ seed }: { seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const engine = new GameEngine(canvas, seed);
    engine.start();

    const onResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      engine.resize(canvas.width, canvas.height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      engine.stop();
      window.removeEventListener("resize", onResize);
    };
  }, [seed]);

  return <canvas ref={canvasRef} className="h-screen w-screen bg-black" />;
}
```

The page at `/asteroids` just renders `<GameCanvas seed={42} />`.

---

## Build order

For the workshop, implement in this order:

1. **Scaffold**: `GameCanvas.tsx` with a blank canvas + `engine.ts` with an empty class that just clears the screen each frame. Confirm the canvas fills the viewport and the loop runs.
2. **Ship**: add ship state, draw the triangle, make it move and wrap around edges.
3. **Autopilot**: add seeded RNG, apply random heading changes each frame so the ship flies itself.
4. **Asteroids**: spawn them on a timer from random edges, draw them, move them, wrap them.
5. **Collision**: add circle-vs-circle check. Set `alive = false` on hit, draw "GAME OVER".
6. **Score + difficulty**: track elapsed time, draw it on canvas, ramp spawn rate over time.

Each step is independently testable — you can see something working after every step.
