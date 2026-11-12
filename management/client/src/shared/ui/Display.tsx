import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";

import EmptyIllustration from "./EmptyIllustration";

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-line", className)}>
      {(title || action) && (
        <header className="flex h-11 items-center justify-between gap-2 border-b border-line px-4">
          <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Soft tinted label. With a colour it tints to that colour; without, it is neutral. */
export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-[12px] font-medium whitespace-nowrap bg-active/70 text-fg-muted",
        className,
      )}
    >
      {color && <span className="size-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-active/60 px-1.5 py-px font-mono text-[12px] text-fg-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
  className,
  art,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Replaces the default stacked-cards illustration. */
  art?: ReactNode;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      {art ?? <EmptyIllustration icon={IconCmp} />}
      <p className="text-[14px] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-active", className)} />;
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5 p-6">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10" />
      ))}
    </div>
  );
}

/** Small ring showing a share from 0 to 1. */
export function ProgressRing({
  value,
  size = 16,
  color = "var(--accent)",
}: {
  value: number;
  size?: number;
  color?: string;
}) {
  const stroke = size > 24 ? 3.5 : 2.25;
  const r = (size - stroke - 1) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--active)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, Math.max(0, value))} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function ProgressBar({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-active">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`,
          background: color,
        }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: IconCmp,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: Icon;
  hint?: string;
  /** Kept for callers; cards stay neutral (colour is reserved for status). */
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-line px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[24px] leading-none font-semibold tracking-[-0.02em] text-fg tabular-nums">
          {value}
        </div>
        <IconCmp size={16} className="text-fg-subtle" />
      </div>
      <div className="mt-2.5 text-[13px] font-medium text-fg-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[12px] text-fg-subtle">{hint}</div>}
    </div>
  );
}
