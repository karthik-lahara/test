import type { MouseEvent } from "react";
import { Star } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";
import type { Project } from "@/shared/types/entities";

import { useToggleFavorite } from "../queries/projects.queries";

/** Gold for a starred project. */
export const STARRED_COLOR = "#f5a524";

/**
 * Star toggle for a project: filled gold when starred, a grey outline when not
 * (gold on hover, so it's clear what a click does).
 * Demo mode (npm run dev:mock) shows the original screens, which don't use this.
 */
export default function StarButton({
  project,
  size = 14,
  className,
}: {
  project: Project;
  size?: number;
  className?: string;
}) {
  const toggle = useToggleFavorite();
  const starred = project.favorite;
  const label = starred ? "Remove from starred" : "Add to starred";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={starred}
      disabled={toggle.isPending}
      onClick={(e: MouseEvent) => {
        // Rows and cards open the project on click; starring shouldn't
        e.stopPropagation();
        toggle.mutate(project.id);
      }}
      style={starred ? { color: STARRED_COLOR } : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60",
        !starred && "text-fg-subtle hover:text-[#f5a524]",
        className,
      )}
    >
      <Star size={size} weight={starred ? "fill" : "regular"} />
    </button>
  );
}
