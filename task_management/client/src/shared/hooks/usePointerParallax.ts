import { type RefObject, useEffect } from "react";

/**
 * Writes the pointer's position relative to an element as two CSS variables,
 * `--px` and `--py`, each eased toward a value in -1..1 (0 = centred).
 * Styles then use them for subtle depth, e.g.
 * `translate: calc(var(--px) * 6px) calc(var(--py) * 4px)`.
 *
 * - `range` is how far (in screen px) from the element's centre the pointer
 *   must be to reach ±1; the whole page is tracked, not just the element.
 * - Does nothing when the user prefers reduced motion.
 * - The animation loop sleeps once values settle, so idle cost is zero.
 */
export function usePointerParallax(ref: RefObject<HTMLElement | null>, range = 600) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    const tick = () => {
      current.x += (target.x - current.x) * 0.1;
      current.y += (target.y - current.y) * 0.1;
      el.style.setProperty("--px", current.x.toFixed(4));
      el.style.setProperty("--py", current.y.toFixed(4));
      const moving = Math.abs(target.x - current.x) + Math.abs(target.y - current.y);
      raf = moving < 0.001 ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    const onMove = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      target.x = clamp((event.clientX - (box.left + box.width / 2)) / range);
      target.y = clamp((event.clientY - (box.top + box.height / 2)) / range);
      wake();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [ref, range]);
}
