import { forwardRef, type TextareaHTMLAttributes, useId } from "react";

import { cn } from "@/shared/lib/cn";

import { controlClass } from "./controlClass";
import Field from "./Field";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, id, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={Boolean(error)}
        className={cn(controlClass, "resize-y py-2", error && "border-red-500/70", className)}
        {...rest}
      />
    </Field>
  );
});

export default TextArea;
