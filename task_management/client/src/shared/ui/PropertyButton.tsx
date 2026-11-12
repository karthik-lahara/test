import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

interface PropertyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  muted?: boolean;
  compact?: boolean;
}

/** Borderless button showing a property value; opens its picker on click. */
const PropertyButton = forwardRef<HTMLButtonElement, PropertyButtonProps>(function PropertyButton(
  { children, muted, compact, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md text-[12.5px] transition-colors hover:bg-hover disabled:pointer-events-none",
        compact ? "h-6 px-1" : "h-7 px-1.5",
        muted ? "text-fg-subtle" : "text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default PropertyButton;
