import { type ReactNode, useCallback, useRef, useState } from "react";
import type { Icon } from "@phosphor-icons/react";

import { useDismiss } from "@/shared/hooks/useDismiss";
import { cn } from "@/shared/lib/cn";

export interface MenuItem {
  label: string;
  icon?: Icon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  align?: "left" | "right";
  placement?: "bottom" | "top";
  className?: string;
}

export default function Menu({
  items,
  trigger,
  align = "right",
  placement = "bottom",
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          role="menu"
          className={cn(
            "animate-pop absolute z-40 min-w-44 rounded-lg border border-line bg-raised p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            placement === "bottom" ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {items.map(({ label, icon: IconCmp, onSelect, danger, disabled }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                close();
                onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-hover disabled:opacity-40",
                danger ? "text-[#e5484d]" : "text-fg",
              )}
            >
              {IconCmp && <IconCmp size={15} className={danger ? "" : "text-fg-muted"} />}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
