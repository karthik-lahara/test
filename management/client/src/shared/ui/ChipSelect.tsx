import type { ReactNode } from "react";
import { Check } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";

interface ChipSelectProps {
  label?: string;
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  value: string[];
  onChange: (value: string[]) => void;
}

/** Toggleable chips for picking several items from a short list. */
export default function ChipSelect({ label, options, value, onChange }: ChipSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-medium text-fg-muted">{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])
              }
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                on
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line text-fg-muted hover:bg-hover",
              )}
            >
              {on ? <Check size={11} className="text-accent" /> : option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
