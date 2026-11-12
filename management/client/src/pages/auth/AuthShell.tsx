import { type ReactNode, useRef } from "react";
import { CaretRight, Sparkle } from "@phosphor-icons/react";

import type { WorkItemStatus, WorkItemType } from "@/shared/constants/workItem";
import { usePointerParallax } from "@/shared/hooks/usePointerParallax";
import GlyphField from "@/shared/ui/GlyphField";
import Logo from "@/shared/ui/Logo";
import { StatusIcon, TypeBadge } from "@/shared/ui/WorkIcons";

const PREVIEW: Array<{
  depth: number;
  type: WorkItemType;
  title: string;
  status: WorkItemStatus;
  progress?: number;
}> = [
  { depth: 0, type: "EPIC", title: "Customer self-service", status: "IN_PROGRESS", progress: 62 },
  { depth: 1, type: "FEATURE", title: "Invoices and billing", status: "IN_PROGRESS", progress: 48 },
  {
    depth: 2,
    type: "STORY",
    title: "Customer downloads past invoices",
    status: "QA",
    progress: 75,
  },
  { depth: 3, type: "TASK", title: "PDF export endpoint", status: "DONE" },
  { depth: 3, type: "TASK", title: "Invoice list UI", status: "IN_PROGRESS" },
  { depth: 3, type: "BUG", title: "Totals off by rounding", status: "TODO" },
];

/** Two-column layout shared by the login and signup pages. */
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  usePointerParallax(stageRef, 700);

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg">Lahara Tasks</span>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-fg">
            {title}
          </h1>
          <p className="mt-2 mb-8 text-[13px] text-fg-muted">{subtitle}</p>
          {children}
        </div>
        <p className="text-[12px] text-fg-subtle">© Lahara Protocol Labs</p>
      </div>

      <div className="relative m-2 hidden overflow-hidden rounded-lg border border-line bg-raised lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div className="pointer-events-none absolute inset-0">
          <GlyphField />
        </div>
        {/* Keeps the copy readable over the moving field. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_40%_50%,var(--raised)_45%,transparent_100%)]" />
        <div ref={stageRef} className="relative [perspective:1400px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-[12px] text-fg-muted">
            <Sparkle size={12} weight="fill" className="text-accent" />
            AI-first work management
          </span>
          <h2 className="mt-5 max-w-lg text-[44px] leading-[1.05] font-semibold tracking-[-0.04em] text-fg">
            From epic to done, <span className="text-fg-muted">with AI at your side.</span>
          </h2>
          <p className="mt-4 max-w-md text-[14px] text-fg-muted">
            Describe work in a sentence or say it out loud. AI drafts the story, you approve, and
            the whole team sees progress roll up.
          </p>

          {/* Product preview: tilts a few degrees toward the cursor, with a soft light that follows it. */}
          <div
            className="relative mt-10 max-w-xl rounded-lg border border-line-strong bg-panel shadow-pop will-change-transform"
            style={{
              transform:
                "rotateX(calc(var(--py, 0) * -5deg)) rotateY(calc(var(--px, 0) * 6deg)) translateZ(0)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-lg"
              style={{
                background:
                  "radial-gradient(420px circle at calc(50% + var(--px, 0) * 60%) calc(50% + var(--py, 0) * 80%), color-mix(in srgb, var(--fg) 6%, transparent), transparent 60%)",
              }}
            />
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
              <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
              <span className="size-2.5 rounded-full bg-[#28c840]/80" />
              <span className="ml-3 text-[12px] text-fg-subtle">AXMS · Hierarchy</span>
            </div>
            <ul className="py-1.5">
              {PREVIEW.map((row) => (
                <li
                  key={row.title}
                  className="flex h-9 items-center gap-2.5 pr-4 text-[12.5px]"
                  style={{ paddingLeft: 14 + row.depth * 20 }}
                >
                  <CaretRight
                    size={10}
                    weight="bold"
                    className={row.depth < 3 ? "rotate-90 text-fg-subtle" : "invisible"}
                  />
                  <TypeBadge type={row.type} />
                  <StatusIcon status={row.status} size={13} />
                  <span
                    className={
                      row.status === "DONE"
                        ? "flex-1 truncate text-fg-subtle line-through"
                        : row.depth === 0
                          ? "flex-1 truncate font-semibold text-fg"
                          : "flex-1 truncate text-fg"
                    }
                  >
                    {row.title}
                  </span>
                  {row.progress !== undefined && (
                    <span className="flex w-24 items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-active">
                        <span
                          className="block h-full rounded-full bg-fg-subtle"
                          style={{ width: `${row.progress}%` }}
                        />
                      </span>
                      <span className="text-[12px] text-fg-subtle tabular-nums">
                        {row.progress}%
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
