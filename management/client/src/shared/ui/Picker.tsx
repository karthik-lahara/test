import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Check, MagnifyingGlass } from "@phosphor-icons/react";

import { useDismiss } from "@/shared/hooks/useDismiss";
import { cn } from "@/shared/lib/cn";

export interface PickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

interface PickerProps {
  options: PickerOption[];
  /** Selected values. A single-select picker passes one. */
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  /** Renders the trigger; `open` toggles the menu. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  placeholder?: string;
  align?: "left" | "right";
  searchable?: boolean;
}

/** Small popover list used for status, priority, assignee and other property pickers. */
export default function Picker({
  options,
  value,
  onChange,
  multiple,
  trigger,
  placeholder = "Filter…",
  align = "left",
  searchable = true,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useDismiss(ref, open, close);

  const filtered = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );

  function select(next: string) {
    if (multiple) {
      onChange(value.includes(next) ? value.filter((v) => v !== next) : [...value, next]);
    } else {
      onChange([next]);
      close();
    }
  }

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => (open ? close() : setOpen(true)) })}
      {open && (
        <div
          className={cn(
            "animate-pop absolute top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-raised shadow-pop",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-2.5">
              <MagnifyingGlass size={13} className="text-fg-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                className="h-8 w-full bg-transparent text-[12.5px] text-fg placeholder:text-fg-subtle focus:outline-none"
              />
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-fg-subtle">No matches</li>
            )}
            {filtered.map((option) => {
              const selected = value.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => select(option.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-hover"
                  >
                    {option.icon}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint && (
                      <span className="text-[12px] text-fg-subtle">{option.hint}</span>
                    )}
                    {selected && <Check size={13} className="text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
