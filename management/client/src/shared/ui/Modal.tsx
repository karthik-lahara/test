import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";

import IconButton from "./IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Header content shown left of the close button, in place of the title. */
  header?: ReactNode;
}

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  header,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-overlay p-4 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-pop flex w-full flex-col rounded-xl border border-line-strong bg-panel shadow-pop",
          SIZES[size],
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            {header ?? (
              <>
                {title && <h2 className="text-[14px] font-semibold text-fg">{title}</h2>}
                {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
              </>
            )}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="px-5 pt-2 pb-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
