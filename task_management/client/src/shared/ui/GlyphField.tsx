import { useEffect, useRef } from "react";

/**
 * Animated ASCII background: a soft rippling field of dots with small task
 * cards drifting through it. Each card leaves a fading trail. Decorative only.
 *
 * - Pauses when the tab is hidden.
 * - Draws one still frame when the user prefers reduced motion.
 */

const RAMP = [" ", "·", ":", "∙", "•", "▪"] as const;
const FPS = 24;
const FONT_PX = 11;

/** Small task cards: open, in progress, done. */
const SPRITES = [
  ["┌──────────┐", "│ ☐ ────── │", "│ ☐ ────   │", "└──────────┘"],
  ["┌──────────┐", "│ ◐ ─────  │", "│   ──     │", "└──────────┘"],
  ["┌──────────┐", "│ ☑ ────── │", "│ ☑ ───    │", "└──────────┘"],
  ["╭────╮", "│ ✓  │", "╰────╯"],
] as const;

type Sprite = (typeof SPRITES)[number];

interface Card {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  sprite: Sprite;
  w: number;
  h: number;
}

function glyph(value: number) {
  const v = Math.max(0, Math.min(0.999, value));
  return RAMP[Math.floor(v * RAMP.length)] ?? " ";
}

function cellSize(el: HTMLElement) {
  const probe = document.createElement("span");
  probe.textContent = "M";
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${FONT_PX}px var(--font-mono);line-height:1;`;
  el.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  el.removeChild(probe);
  return { w: rect.width || 7, h: rect.height || FONT_PX };
}

export default function GlyphField({ className }: { className?: string }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let cols = 0;
    let rows = 0;
    let cell = cellSize(el);
    let trail = new Float32Array(0);
    let mask = new Uint16Array(0);
    let cards: Card[] = [];
    let raf = 0;
    let running = false;
    let last = 0;
    let t = 0;
    let previous = "";
    /** Pointer position in grid cells; null when it is outside the field. */
    let pointer: { col: number; row: number } | null = null;

    const onPointer = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      pointer = inside
        ? { col: (event.clientX - box.left) / cell.w, row: (event.clientY - box.top) / cell.h }
        : null;
    };

    /** Soft spotlight around the pointer; it feeds the trail so it fades out behind. */
    const lightPointer = () => {
      if (!pointer) return;
      const radius = 9; // in columns; rows are scaled by the cell aspect ratio
      const aspect = cell.h / cell.w;
      const r0 = Math.max(0, Math.floor(pointer.row - radius / aspect));
      const r1 = Math.min(rows - 1, Math.ceil(pointer.row + radius / aspect));
      const c0 = Math.max(0, Math.floor(pointer.col - radius));
      const c1 = Math.min(cols - 1, Math.ceil(pointer.col + radius));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const d = Math.hypot(c - pointer.col, (r - pointer.row) * aspect) / radius;
          if (d >= 1) continue;
          const i = r * cols + c;
          trail[i] = Math.max(trail[i] ?? 0, (1 - d) * (1 - d) * 0.75);
        }
      }
    };

    const resize = () => {
      cell = cellSize(el);
      const c = Math.ceil(el.clientWidth / cell.w);
      const r = Math.ceil(el.clientHeight / cell.h);
      if (c === cols && r === rows) return;
      cols = c;
      rows = r;
      trail = new Float32Array(cols * rows);
      mask = new Uint16Array(cols * rows);
      cards = [];
      previous = "";
    };

    /** `anywhere` places the card inside the field (used on the first fill). */
    const spawn = (anywhere = false) => {
      const sprite = SPRITES[Math.floor(Math.random() * SPRITES.length)]!;
      const w = Math.max(...sprite.map((line) => line.length));
      const h = sprite.length;
      const fromLeft = Math.random() < 0.5;
      const speed = 0.05 + Math.random() * 0.06;
      cards.push({
        x: anywhere ? Math.random() * Math.max(1, cols - w) : fromLeft ? -w - 1 : cols + 1,
        y: Math.random() * Math.max(1, rows - h),
        vx: fromLeft ? speed : -speed,
        vy: (Math.random() - 0.5) * 0.02,
        age: anywhere ? 30 : 0,
        life: 300 + Math.random() * 240,
        sprite,
        w,
        h,
      });
    };

    const stamp = (card: Card, alpha: number) => {
      const bx = Math.round(card.x);
      const by = Math.round(card.y);
      card.sprite.forEach((line, sr) => {
        const row = by + sr;
        if (row < 0 || row >= rows) return;
        for (let sc = 0; sc < line.length; sc++) {
          const ch = line[sc];
          const col = bx + sc;
          if (!ch || ch === " " || col < 0 || col >= cols) continue;
          const i = row * cols + col;
          trail[i] = Math.max(trail[i] ?? 0, alpha * 0.9);
          if (alpha > 0.35) mask[i] = ch.charCodeAt(0);
        }
      });
    };

    const render = () => {
      let out = "";
      for (let r = 0; r < rows; r++) {
        const rowWave = Math.cos(r * 0.11 - t * 0.045);
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const ch = mask[i];
          if (ch) {
            out += String.fromCharCode(ch);
            continue;
          }
          const ambient = (Math.sin(c * 0.07 + t * 0.055) + rowWave) * 0.13 + 0.16;
          out += glyph(Math.max(trail[i] ?? 0, ambient));
        }
        if (r < rows - 1) out += "\n";
      }
      if (out !== previous) {
        el.textContent = out;
        previous = out;
      }
    };

    const drawStill = () => {
      mask.fill(0);
      trail.fill(0);
      for (let y = 2, n = 0; y < rows - 4; y += 9, n++) {
        for (let x = n % 2 ? 14 : 3; x < cols - 12; x += 26) {
          const sprite = SPRITES[(x + y) % SPRITES.length]!;
          stamp({ x, y, vx: 0, vy: 0, age: 0, life: 1, sprite, w: 0, h: 0 }, 1);
        }
      }
      render();
    };

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / FPS || !cols || !rows) return;
      const dt = Math.min(2, last ? (now - last) / 16.67 : 1);
      last = now;
      t += dt;

      const wanted = Math.max(4, Math.floor((cols * rows) / 1800));
      const firstFill = cards.length === 0;
      while (cards.length < wanted) spawn(firstFill);

      for (let i = 0; i < trail.length; i++) trail[i] = (trail[i] ?? 0) * 0.9;
      mask.fill(0);
      lightPointer();

      for (let i = cards.length - 1; i >= 0; i--) {
        const card = cards[i]!;
        card.age += dt;
        card.vy += Math.sin((card.x + t) * 0.05) * 0.0015;
        card.x += card.vx * dt;
        card.y += card.vy * dt;
        const gone =
          card.age > card.life ||
          card.x < -card.w - 2 ||
          card.x > cols + 2 ||
          card.y < -card.h - 2 ||
          card.y > rows + 2;
        if (gone) {
          cards.splice(i, 1);
          continue;
        }
        const p = card.age / card.life;
        stamp(card, p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1);
      }
      render();
    };

    const sync = () => {
      const visible = document.visibilityState !== "hidden";
      if (reduced.matches || !visible) {
        running = false;
        cancelAnimationFrame(raf);
        if (reduced.matches && cols && rows) drawStill();
        return;
      }
      if (!running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    const observer = new ResizeObserver(() => {
      resize();
      sync();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    resize();
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <pre
      ref={ref}
      aria-hidden
      className={`m-0 size-full overflow-hidden p-0 leading-none text-fg-subtle/70 select-none ${className ?? ""}`}
      style={{ fontSize: FONT_PX, fontFamily: "var(--font-mono)" }}
    />
  );
}
