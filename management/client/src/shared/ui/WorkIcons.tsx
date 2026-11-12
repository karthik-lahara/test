import {
  Bug,
  CheckSquare,
  type Icon,
  Lightbulb,
  Lightning,
  ListChecks,
  TreeStructure,
} from "@phosphor-icons/react";

import {
  type Priority,
  PRIORITY_META,
  STATUS_META,
  TYPE_META,
  type WorkItemStatus,
  type WorkItemType,
} from "@/shared/constants/workItem";

/** Status drawn as a ring that fills as the work moves forward. */
export function StatusIcon({ status, size = 14 }: { status: WorkItemStatus; size?: number }) {
  const { color, label } = STATUS_META[status];
  const r = 5.5;
  const c = 2 * Math.PI * 3;
  const fill = { TODO: 0, IN_PROGRESS: 0.5, BLOCKED: 0, QA: 0.75, DONE: 1 }[status];

  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label}>
      <title>{label}</title>
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={status === "TODO" ? "2.2 1.6" : undefined}
      />
      {status === "DONE" ? (
        <>
          <circle cx="7" cy="7" r={r} fill={color} />
          <path
            d="M4.6 7.2l1.6 1.6 3.2-3.4"
            fill="none"
            stroke="white"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : status === "BLOCKED" ? (
        <path d="M4.5 9.5l5-5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        fill > 0 && (
          <circle
            cx="7"
            cy="7"
            r="3"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${c * fill} ${c}`}
            transform="rotate(-90 7 7)"
          />
        )
      )}
    </svg>
  );
}

/** Priority drawn as signal bars; urgent is a filled warning square. */
export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const { label, level } = PRIORITY_META[priority];
  if (priority === "URGENT") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label}>
        <title>{label}</title>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="#f97316" />
        <rect x="6.25" y="3.5" width="1.5" height="4.5" rx="0.75" fill="white" />
        <rect x="6.25" y="9" width="1.5" height="1.5" rx="0.75" fill="white" />
      </svg>
    );
  }
  if (priority === "NONE") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label}>
        <title>{label}</title>
        {[2, 6, 10].map((x) => (
          <rect
            key={x}
            x={x}
            y="6.25"
            width="2.5"
            height="1.5"
            rx="0.5"
            fill="currentColor"
            opacity="0.5"
          />
        ))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label}>
      <title>{label}</title>
      {[1, 2, 3].map((bar) => (
        <rect
          key={bar}
          x={1.5 + (bar - 1) * 4}
          y={12 - bar * 3.5}
          width="2.75"
          height={bar * 3.5}
          rx="0.6"
          fill="currentColor"
          opacity={bar <= level ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

const TYPE_ICONS: Record<WorkItemType, Icon> = {
  EPIC: Lightning,
  FEATURE: Lightbulb,
  STORY: ListChecks,
  TASK: CheckSquare,
  SUBTASK: TreeStructure,
  BUG: Bug,
};

export function TypeIcon({ type, size = 14 }: { type: WorkItemType; size?: number }) {
  const IconCmp = TYPE_ICONS[type];
  const { color, label } = TYPE_META[type];
  return <IconCmp size={size} weight="fill" color={color} aria-label={label} />;
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

const SHORT_LABEL: Record<WorkItemType, string> = {
  EPIC: "Epic",
  FEATURE: "Feature",
  STORY: "Story",
  TASK: "Task",
  SUBTASK: "Subtask",
  BUG: "Bug",
};

/** Coloured chip naming the level of a work item: Epic, Feature, Story, Task, Subtask or Bug. */
export function TypeBadge({ type, className }: { type: WorkItemType; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded bg-active/70 px-1.5 text-[12px] font-medium text-fg-muted ${className ?? ""}`}
    >
      <TypeIcon type={type} size={11} />
      {SHORT_LABEL[type]}
    </span>
  );
}
