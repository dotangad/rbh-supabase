// ── Types ────────────────────────────────────────────────────────────────────

type Vec2 = { x: number; y: number };

interface Ship {
  pos: Vec2;
  heading: number;
  radius: number;
  alive: boolean;
}

interface Asteroid {
  pos: Vec2;
  vel: Vec2;
  radius: number;
}

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private rng: () => number;

  private width: number;
  private height: number;

  private ship: Ship;
  private asteroids: Asteroid[] = [];

  private elapsed = 0;
  private spawnTimer = 0;
  private lastTime = 0;
  private rafId = 0;

  // Input
  private keys = new Set<string>();

  // Callback
  private onGameOver?: (score: number) => void;

  // Tuning constants
  private readonly SHIP_SPEED = 120; // px/s
  private readonly SHIP_RADIUS = 12;
  private readonly TURN_RATE = 1.5; // max rad/s of random turning
  private readonly MANUAL_TURN_RATE = 4; // rad/s when holding a key
  private readonly BASE_SPAWN_INTERVAL = 1.5; // seconds between spawns
  private readonly DIFFICULTY_STEP = 10; // seconds between ramps
  private readonly BASE_ASTEROID_SPEED = 80; // px/s

  constructor(canvas: HTMLCanvasElement, seed: number, onGameOver?: (score: number) => void) {
    this.ctx = canvas.getContext("2d")!;
    this.rng = mulberry32(seed);
    this.width = canvas.width;
    this.height = canvas.height;

    this.onGameOver = onGameOver;

    this.ship = {
      pos: { x: this.width / 2, y: this.height / 2 },
      heading: this.rng() * Math.PI * 2,
      radius: this.SHIP_RADIUS,
      alive: true,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start() {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key);
  };

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.draw();

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ── Difficulty helpers ─────────────────────────────────────────────────────

  private get difficulty(): number {
    return Math.floor(this.elapsed / this.DIFFICULTY_STEP);
  }

  private get spawnInterval(): number {
    // Gets faster over time, but never below 0.3s
    return Math.max(0.3, this.BASE_SPAWN_INTERVAL - this.difficulty * 0.15);
  }

  private get speedMultiplier(): number {
    return 1 + this.difficulty * 0.25;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  private update(dt: number) {
    if (!this.ship.alive) return;

    this.elapsed += dt;

    // 1. Steering: manual keys override autopilot
    const steering =
      (this.keys.has("ArrowLeft") || this.keys.has("a") ? -1 : 0) +
      (this.keys.has("ArrowRight") || this.keys.has("d") ? 1 : 0);

    if (steering !== 0) {
      this.ship.heading += steering * this.MANUAL_TURN_RATE * dt;
    } else {
      // Autopilot: small random heading change
      this.ship.heading += (this.rng() - 0.5) * 2 * this.TURN_RATE * dt;
    }

    // 2. Move ship
    this.ship.pos.x += Math.cos(this.ship.heading) * this.SHIP_SPEED * dt;
    this.ship.pos.y += Math.sin(this.ship.heading) * this.SHIP_SPEED * dt;
    this.wrap(this.ship.pos);

    // 3. Spawn asteroids on a timer
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnAsteroid();
    }

    // 4. Move asteroids
    for (const a of this.asteroids) {
      a.pos.x += a.vel.x * dt;
      a.pos.y += a.vel.y * dt;
    }

    // 5. Collision check (circle vs circle)
    for (const a of this.asteroids) {
      const dx = this.ship.pos.x - a.pos.x;
      const dy = this.ship.pos.y - a.pos.y;
      if (dx * dx + dy * dy < (this.ship.radius + a.radius) ** 2) {
        this.ship.alive = false;
        this.onGameOver?.(Math.floor(this.elapsed));
        break;
      }
    }

    // 6. Cull asteroids that drifted well off-screen
    const margin = 100;
    this.asteroids = this.asteroids.filter(
      (a) =>
        a.pos.x > -margin &&
        a.pos.x < this.width + margin &&
        a.pos.y > -margin &&
        a.pos.y < this.height + margin,
    );
  }

  // ── Spawning ───────────────────────────────────────────────────────────────

  private spawnAsteroid() {
    const edge = Math.floor(this.rng() * 4);
    const radius = 15 + this.rng() * 25;
    const speed =
      this.BASE_ASTEROID_SPEED *
      this.speedMultiplier *
      (0.5 + this.rng() * 0.5);
    const spread = (this.rng() - 0.5) * 1.2; // angle spread from straight inward

    let pos: Vec2;
    let vel: Vec2;

    switch (edge) {
      case 0: // top → drifts down
        pos = { x: this.rng() * this.width, y: -radius };
        vel = { x: Math.sin(spread) * speed, y: Math.cos(spread) * speed };
        break;
      case 1: // right → drifts left
        pos = { x: this.width + radius, y: this.rng() * this.height };
        vel = { x: -Math.cos(spread) * speed, y: Math.sin(spread) * speed };
        break;
      case 2: // bottom → drifts up
        pos = { x: this.rng() * this.width, y: this.height + radius };
        vel = { x: Math.sin(spread) * speed, y: -Math.cos(spread) * speed };
        break;
      default: // left → drifts right
        pos = { x: -radius, y: this.rng() * this.height };
        vel = { x: Math.cos(spread) * speed, y: Math.sin(spread) * speed };
        break;
    }

    this.asteroids.push({ pos, vel, radius });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private wrap(pos: Vec2) {
    if (pos.x < 0) pos.x += this.width;
    if (pos.x > this.width) pos.x -= this.width;
    if (pos.y < 0) pos.y += this.height;
    if (pos.y > this.height) pos.y -= this.height;
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private draw() {
    const { ctx, width: w, height: h } = this;

    // Background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // Asteroids
    ctx.fillStyle = "#888";
    for (const a of this.asteroids) {
      ctx.beginPath();
      ctx.arc(a.pos.x, a.pos.y, a.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ship (triangle pointing in heading direction)
    if (this.ship.alive) {
      const { pos, heading, radius: r } = this.ship;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(
        pos.x + Math.cos(heading) * r * 1.5,
        pos.y + Math.sin(heading) * r * 1.5,
      );
      ctx.lineTo(
        pos.x + Math.cos(heading + 2.4) * r,
        pos.y + Math.sin(heading + 2.4) * r,
      );
      ctx.lineTo(
        pos.x + Math.cos(heading - 2.4) * r,
        pos.y + Math.sin(heading - 2.4) * r,
      );
      ctx.closePath();
      ctx.fill();
    }

    // Score (top-left)
    ctx.fillStyle = "#fff";
    ctx.font = "20px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${Math.floor(this.elapsed)}`, 16, 32);
    ctx.textAlign = "right";
    ctx.fillText(`< > or A D to steer`, w - 16, 32);
    ctx.textAlign = "left";

    // Game over overlay
    if (!this.ship.alive) {
      ctx.fillStyle = "#fff";
      ctx.font = "48px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", w / 2, h / 2);
      ctx.font = "20px monospace";
      ctx.fillText(
        `Final score: ${Math.floor(this.elapsed)}`,
        w / 2,
        h / 2 + 40,
      );
    }
  }
}
