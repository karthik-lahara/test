import { forwardRef, type SelectHTMLAttributes, useId } from "react";
import { CaretDown } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";

import { controlClass } from "./controlClass";
import Field from "./Field";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          className={cn(controlClass, "h-9 appearance-none pr-8", className)}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <CaretDown
          size={12}
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-subtle"
        />
      </div>
    </Field>
  );
});

export default Select;
