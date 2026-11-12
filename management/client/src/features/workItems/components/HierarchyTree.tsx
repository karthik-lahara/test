import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CaretRight, Plus, TreeStructure } from "@phosphor-icons/react";

import { workItemPath } from "@/shared/constants/routes";
import { CHILD_TYPE, STATUS_META, TYPE_META, type WorkItemType } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import type { Project, WorkItem } from "@/shared/types/entities";
import Button from "@/shared/ui/Button";
import { EmptyState, ListSkeleton } from "@/shared/ui/Display";
import { StatusIcon, TypeBadge } from "@/shared/ui/WorkIcons";

import { useCreateWorkItemDialog } from "../createContext";
import { childrenMap, HIERARCHY_LEVELS, rollup } from "../hierarchy";
import { useUpdateWorkItem } from "../queries/workItems.queries";
import { AssigneePicker, DueDateLabel } from "./pickers";

interface HierarchyTreeProps {
  items: WorkItem[] | undefined;
  isLoading: boolean;
  project: Project;
}

const LEVEL_HINT: Record<string, string> = {
  EPIC: "Big goal",
  FEATURE: "Capability",
  STORY: "User need",
  TASK: "Work to do",
  SUBTASK: "Small step",
};

const SHORT: Record<WorkItemType, string> = {
  EPIC: "Epic",
  FEATURE: "Feature",
  STORY: "Story",
  TASK: "Task",
  SUBTASK: "Subtask",
  BUG: "Bug",
};

/** Epics → Features → Stories → Tasks → Subtasks as an expandable tree with rolled-up progress. */
export default function HierarchyTree({ items, isLoading, project }: HierarchyTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const openCreate = useCreateWorkItemDialog();
  const newEpic = () => openCreate({ mode: "manual", projectId: project.id, type: "EPIC" });
  const { children, roots, counts } = useMemo(() => {
    const list = items ?? [];
    const ids = new Set(list.map((i) => i.id));
    const counts = new Map<WorkItemType, number>();
    for (const item of list) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    return {
      children: childrenMap(list),
      roots: list
        .filter((i) => !i.parentId || !ids.has(i.parentId))
        .sort((a, b) => Number(b.type === "EPIC") - Number(a.type === "EPIC") || a.order - b.order),
      counts,
    };
  }, [items]);

  if (isLoading) return <ListSkeleton rows={10} />;
  if (!items?.length) {
    return (
      <EmptyState
        icon={TreeStructure}
        title="Nothing planned yet"
        description="Start with an epic, break it into features and stories, then tasks."
        action={
          <Button variant="primary" size="sm" icon={Plus} onClick={newEpic}>
            New epic
          </Button>
        }
      />
    );
  }

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const parents = [...children.keys()];
  const allOpen = collapsed.size === 0;

  return (
    <div>
      {/* Level legend */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line px-4 py-3 md:px-6">
        {HIERARCHY_LEVELS.map((level, index) => (
          <div key={level} className="flex items-center gap-2">
            {index > 0 && <ArrowRight size={12} className="text-fg-subtle" />}
            <div className="flex items-center gap-2 rounded-lg border border-line bg-raised/60 py-1 pr-2.5 pl-1">
              <TypeBadge type={level} />
              <span className="text-[12px] text-fg-muted">
                {counts.get(level) ?? 0}
                <span className="ml-1 hidden text-fg-subtle 2xl:inline">· {LEVEL_HINT[level]}</span>
              </span>
            </div>
          </div>
        ))}
        {counts.get("BUG") ? (
          <div className="ml-1 flex items-center gap-2 rounded-lg border border-line bg-raised/60 py-1 pr-2.5 pl-1">
            <TypeBadge type="BUG" />
            <span className="text-[12px] text-fg-muted">{counts.get("BUG")}</span>
          </div>
        ) : null}
        <span className="flex-1" />
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setCollapsed(allOpen ? new Set(parents) : new Set())}
            className="h-7 rounded-md px-2 text-[12.5px] font-medium whitespace-nowrap text-fg-muted hover:bg-hover hover:text-fg"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
          <Button variant="secondary" size="sm" icon={Plus} onClick={newEpic}>
            New epic
          </Button>
        </div>
      </div>

      {/* Column labels */}
      <div className="flex h-8 items-center gap-3 border-b border-line px-4 text-[12px] font-medium text-fg-subtle md:px-6">
        <span className="flex-1">Work item</span>
        <span className="hidden w-40 md:block">Progress</span>
        <span className="hidden w-16 sm:block">Due</span>
        <span className="w-[76px]" />
        <span className="w-7" />
      </div>

      <ul>
        {roots.map((item) => (
          <Node
            key={item.id}
            item={item}
            depth={0}
            childrenOf={children}
            collapsed={collapsed}
            onToggle={toggle}
            project={project}
          />
        ))}
      </ul>
      <button
        onClick={newEpic}
        className="flex h-10 w-full items-center gap-2 px-4 text-[12.5px] text-fg-subtle transition-colors hover:bg-hover/70 hover:text-fg md:px-6"
      >
        <Plus size={13} />
        New epic
      </button>
    </div>
  );
}

function Node({
  item,
  depth,
  childrenOf,
  collapsed,
  onToggle,
  project,
}: {
  item: WorkItem;
  depth: number;
  childrenOf: Map<string, WorkItem[]>;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  project: Project;
}) {
  const navigate = useNavigate();
  const update = useUpdateWorkItem();
  const openCreate = useCreateWorkItemDialog();
  const childType = CHILD_TYPE[item.type];
  const kids = childrenOf.get(item.id) ?? [];
  const open = !collapsed.has(item.id);
  const progress = rollup(item.id, childrenOf);
  const color = TYPE_META[item.type].color;
  const big = item.type === "EPIC";
  const done = item.status === "DONE";

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        onClick={() => navigate(workItemPath(item.key))}
        onKeyDown={(e) => e.key === "Enter" && navigate(workItemPath(item.key))}
        className={cn(
          "group relative flex cursor-pointer items-center gap-3 border-b border-line/60 pr-4 transition-colors hover:bg-hover/70 md:pr-6",
          big ? "h-11 bg-raised/40" : "h-9",
        )}
        style={{ paddingLeft: 16 + depth * 22 }}
      >
        {/* Tree guides */}
        {Array.from({ length: depth }, (_, d) => (
          <span
            key={d}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-line-strong/60"
            style={{ left: 16 + d * 22 + 8 }}
          />
        ))}
        {big && (
          <span
            className="pointer-events-none absolute top-0 bottom-0 left-0 w-0.5"
            style={{ background: color }}
          />
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (kids.length) onToggle(item.id);
          }}
          aria-label={open ? "Collapse" : "Expand"}
          className={cn(
            "relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-active hover:text-fg",
            !kids.length && "invisible",
          )}
        >
          <CaretRight
            size={11}
            weight="bold"
            className={cn("transition-transform", open && "rotate-90")}
          />
        </button>

        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <TypeBadge type={item.type} />
          <span className="hidden shrink-0 font-mono text-[12px] text-fg-subtle sm:inline">
            {item.key}
          </span>
          <StatusIcon status={item.status} size={13} />
          <span
            className={cn(
              "truncate",
              big ? "text-[13px] font-semibold" : item.type === "FEATURE" ? "font-medium" : "",
              done ? "text-fg-subtle" : "text-fg",
            )}
            title={`${STATUS_META[item.status].label} · ${item.title}`}
          >
            {item.title}
          </span>
          {kids.length > 0 && (
            <span className="shrink-0 rounded-full bg-active px-1.5 text-[12px] text-fg-muted tabular-nums">
              {kids.length}
            </span>
          )}
        </span>

        <span className="hidden w-40 items-center gap-2 md:flex">
          {progress.total > 0 ? (
            <>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-active">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round(progress.share * 100)}%`,
                    background: progress.done === progress.total ? "#4cc38a" : "var(--fg-subtle)",
                  }}
                />
              </span>
              <span className="w-14 text-right text-[12px] text-fg-muted tabular-nums">
                {progress.done}/{progress.total}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-fg-subtle">—</span>
          )}
        </span>
        <span className="hidden w-16 sm:block">
          <DueDateLabel dueDate={item.dueDate} done={done} />
        </span>
        {/* Add the next level under this row: a feature under an epic, a story under a feature… */}
        <span className="flex w-[76px] shrink-0 justify-end">
          {childType && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCreate({
                  mode: "manual",
                  projectId: project.id,
                  parentId: item.id,
                  type: childType,
                  sprintId: item.sprintId,
                });
              }}
              aria-label={`Add ${TYPE_META[childType].label.toLowerCase()} under ${item.key}`}
              title={`Add ${TYPE_META[childType].label.toLowerCase()} under ${item.key}`}
              className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-active hover:text-fg focus-visible:opacity-100"
            >
              <Plus size={11} weight="bold" />
              {SHORT[childType]}
            </button>
          )}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <AssigneePicker
            compact
            value={item.assigneeIds}
            onChange={(assigneeIds) => update.mutate({ id: item.id, patch: { assigneeIds } })}
            memberIds={project.memberIds}
          />
        </span>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((kid) => (
            <Node
              key={kid.id}
              item={kid}
              depth={depth + 1}
              childrenOf={childrenOf}
              collapsed={collapsed}
              onToggle={onToggle}
              project={project}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
