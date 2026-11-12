import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { cn } from "@/shared/lib/cn";

const pill = (active: boolean) =>
  cn(
    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors",
    active ? "bg-active text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
  );

const underline = (active: boolean) =>
  cn(
    "relative inline-flex h-10 items-center gap-1.5 px-0.5 text-[13px] font-medium whitespace-nowrap transition-colors",
    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
    active ? "text-fg after:bg-fg" : "text-fg-muted after:bg-transparent hover:text-fg",
  );

const count = (active: boolean) =>
  cn("text-[12px] tabular-nums", active ? "text-fg-muted" : "text-fg-subtle");

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** Pill tabs held in component state. */
export function Tabs({
  items,
  value,
  onChange,
  className,
  variant = "pill",
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** "underline" sits on the page header's bottom border. */
  variant?: "pill" | "underline";
}) {
  const tab = variant === "underline" ? underline : pill;
  return (
    <div
      role="tablist"
      className={cn(
        "no-scrollbar flex items-center overflow-x-auto overflow-y-hidden",
        variant === "underline" ? "gap-5 self-end" : "gap-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={tab(active)}
            onClick={() => onChange(item.value)}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && <span className={count(active)}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Pill tabs that are routes. */
export function NavTabs({ items }: { items: Array<TabItem & { to: string; end?: boolean }> }) {
  return (
    <nav className="no-scrollbar flex items-center gap-5 self-end overflow-x-auto overflow-y-hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => underline(isActive)}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Compact segmented switch for 2–4 options inside cards. */
export function Segmented({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded px-2 text-[12px] font-medium transition-colors",
            value === item.value ? "bg-active text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined && (
            <span className="text-fg-subtle tabular-nums">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
