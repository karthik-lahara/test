import type { ButtonHTMLAttributes } from "react";
import type { Icon } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string;
  active?: boolean;
  size?: number;
}

export default function IconButton({
  icon: IconCmp,
  label,
  active,
  size = 16,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40",
        active && "bg-active text-fg",
        className,
      )}
      {...rest}
    >
      <IconCmp size={size} />
    </button>
  );
}
