import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border border-transparent",
  secondary: "bg-transparent text-fg border border-line-strong hover:bg-hover",
  ghost: "text-fg-muted hover:text-fg hover:bg-hover border border-transparent",
  danger: "bg-[#e5484d] text-white hover:bg-[#d63e43] border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-1.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: Icon;
  loading?: boolean;
  children?: ReactNode;
}

export default function Button({
  variant = "secondary",
  size = "md",
  icon: IconCmp,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold transition-colors disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        IconCmp && <IconCmp size={size === "sm" ? 14 : 15} weight="bold" />
      )}
      {children}
    </button>
  );
}
