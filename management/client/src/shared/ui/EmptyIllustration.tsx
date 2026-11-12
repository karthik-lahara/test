import { useRef } from "react";
import type { Icon } from "@phosphor-icons/react";

import { usePointerParallax } from "@/shared/hooks/usePointerParallax";

/**
 * Quiet empty-state art: three stacked task cards.
 *
 * Each layer shifts with the cursor by a different amount (back layers less,
 * front more), which reads as depth. Movement uses the CSS `translate`
 * property, so it combines with the gentle idle float that the `empty-*`
 * classes apply through `transform`.
 */
export default function EmptyIllustration({ icon: IconCmp }: { icon: Icon }) {
  const ref = useRef<HTMLDivElement>(null);
  usePointerParallax(ref, 500);

  const depth = (x: number, y: number) => ({
    translate: `calc(var(--px, 0) * ${x}px) calc(var(--py, 0) * ${y}px)`,
  });

  return (
    <div ref={ref} aria-hidden className="relative mb-5 h-[76px] w-[120px]">
      <span
        className="empty-card-back absolute top-3 left-1 h-12 w-20 rounded-lg border border-line bg-raised"
        style={depth(-3, -2)}
      />
      <span
        className="empty-card-mid absolute top-1.5 right-1 h-12 w-20 rounded-lg border border-line bg-raised"
        style={depth(2, -1)}
      />
      <span className="absolute top-4 left-1/2 -ml-[46px] h-12 w-[92px]" style={depth(7, 5)}>
        <span className="empty-card-front flex size-full items-center gap-2.5 rounded-lg border border-line-strong bg-panel px-3 shadow-pop">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-active text-fg-muted">
            <IconCmp size={14} />
          </span>
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="empty-line h-1 w-full rounded-full bg-active" />
            <span className="empty-line h-1 w-2/3 rounded-full bg-active [animation-delay:200ms]" />
          </span>
        </span>
      </span>
    </div>
  );
}
