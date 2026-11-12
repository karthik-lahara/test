import { forwardRef, type InputHTMLAttributes, useId, useState } from "react";
import { Eye, EyeSlash, type Icon } from "@phosphor-icons/react";

import { env } from "@/shared/config/env";
import { cn } from "@/shared/lib/cn";

import { controlClass } from "./controlClass";
import Field from "./Field";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: Icon;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon: IconCmp, className, id, type, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  // Demo mode (npm run dev:mock) keeps the original field, without the show/hide button
  const isPassword = type === "password" && !env.USE_MOCKS;
  const [showPassword, setShowPassword] = useState(false);
  const ToggleIcon = showPassword ? EyeSlash : Eye;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="relative">
        {IconCmp && (
          <IconCmp
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && showPassword ? "text" : type}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={cn(
            controlClass,
            "h-9",
            IconCmp && "pl-9",
            isPassword && "pr-9",
            error && "border-red-500/70",
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={disabled}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls={inputId}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
          >
            <ToggleIcon size={15} />
          </button>
        )}
      </div>
    </Field>
  );
});

export default Input;
