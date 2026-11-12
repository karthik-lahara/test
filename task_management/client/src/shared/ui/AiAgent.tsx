import { useEffect, useId, useRef } from "react";

/**
 * The AI helper's face: a black tile with gold capsule eyes, in the colours of the Lahara emblem.
 *
 * Deliberately minimal (no mouth, cheeks or bounce) so it reads as a product
 * identity, not a cartoon. All expression comes from where the eyes look:
 *
 * - `idle`     eyes follow the mouse pointer anywhere on the page
 * - `reading`  eyes glance down at the text the user is typing
 * - `thinking` eyes scan slowly left and right; a soft halo breathes
 * - `done`     eyes settle into a calm, half-closed look
 *
 * It blinks every few seconds. With "reduce motion" on it holds still.
 */
export type AiAgentState = "idle" | "reading" | "thinking" | "done";

const REACH_X = 9; // svg units the eyes can travel sideways
const REACH_Y = 7; // and up/down
const FULL_GAZE_PX = 220; // pointer distance for a full glance
const EASE = 0.14;

export default function AiAgent({
  state = "idle",
  size = 40,
  className,
}: {
  state?: AiAgentState;
  size?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const blinkRef = useRef<SVGGElement>(null);
  const stateRef = useRef(state);
  const wakeRef = useRef<() => void>(() => {});
  const uid = useId().replace(/:/g, "");

  // Let the running loop see state changes without restarting it.
  useEffect(() => {
    stateRef.current = state;
    wakeRef.current();
  }, [state]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pointer = { x: 0, y: 0 };
    const gaze = { x: 0, y: 0 };
    let raf = 0;
    let blinkTimer = 0;
    const start = performance.now();

    const targetFor = (now: number) => {
      switch (stateRef.current) {
        case "reading":
          return { x: 0, y: 0.9 };
        case "thinking": {
          const t = (now - start) / 1000;
          return { x: Math.sin(t * 1.6) * 0.75, y: -0.35 };
        }
        case "done":
          return { x: 0, y: 0.15 };
        default:
          return pointer;
      }
    };

    const tick = (now: number) => {
      const target = targetFor(now);
      gaze.x += (target.x - gaze.x) * EASE;
      gaze.y += (target.y - gaze.y) * EASE;
      eyesRef.current?.setAttribute(
        "transform",
        `translate(${(gaze.x * REACH_X).toFixed(2)} ${(gaze.y * REACH_Y).toFixed(2)})`,
      );
      const settled = Math.abs(target.x - gaze.x) + Math.abs(target.y - gaze.y) < 0.002;
      // Thinking animates continuously; other states sleep once settled.
      raf = settled && stateRef.current !== "thinking" ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const onMove = (event: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);
      const strength = Math.min(1, distance / FULL_GAZE_PX);
      pointer.x = distance ? (dx / distance) * strength : 0;
      pointer.y = distance ? (dy / distance) * strength : 0;
      if (stateRef.current === "idle") wake();
    };

    const blink = () => {
      const el = blinkRef.current;
      if (el && stateRef.current !== "done") {
        el.classList.add("agent-blink");
        window.setTimeout(() => el.classList.remove("agent-blink"), 150);
      }
      blinkTimer = window.setTimeout(blink, 3000 + Math.random() * 3500);
    };
    blinkTimer = window.setTimeout(blink, 2200);

    window.addEventListener("pointermove", onMove, { passive: true });
    wake();
    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = () => {};
      window.clearTimeout(blinkTimer);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <span
      className={`relative inline-flex shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {state === "thinking" && <span className="agent-halo absolute inset-0 rounded-[30%]" />}
      <svg ref={svgRef} viewBox="0 0 64 64" width={size} height={size} className="relative">
        <defs>
          {/* Brand: the gold of the Lahara emblem on black. */}
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1c1a16" />
            <stop offset="1" stopColor="#050505" />
          </linearGradient>
          <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd27a" />
            <stop offset="1" stopColor="#f0a020" />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6b73c" stopOpacity="0.7" />
            <stop offset="1" stopColor="#f6b73c" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="19" fill={`url(#${uid}-body)`} />
        <rect
          x="0.75"
          y="0.75"
          width="62.5"
          height="62.5"
          rx="18.25"
          fill="none"
          stroke={`url(#${uid}-edge)`}
          strokeWidth="1.5"
        />
        <g ref={eyesRef}>
          <g ref={blinkRef} className={state === "done" ? "agent-eyes agent-calm" : "agent-eyes"}>
            <rect x="21" y="24" width="7" height="16" rx="3.5" fill={`url(#${uid}-gold)`} />
            <rect x="36" y="24" width="7" height="16" rx="3.5" fill={`url(#${uid}-gold)`} />
          </g>
        </g>
      </svg>
    </span>
  );
}
