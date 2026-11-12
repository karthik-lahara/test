import { type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CaretDown,
  CaretRight,
  ChatCircle,
  Microphone,
  Plus,
  Sparkle,
  Tray,
} from "@phosphor-icons/react";

import { workItemPath } from "@/shared/constants/routes";
import {
  STATUS_META,
  TYPE_META,
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
} from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import type { Project, WorkItem } from "@/shared/types/entities";
import { Badge, EmptyState, ListSkeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import { StatusIcon, TypeIcon } from "@/shared/ui/WorkIcons";

import { useUpdateWorkItem } from "../queries/workItems.queries";
import { AssigneePicker, DueDateLabel, PriorityPicker, StatusPicker } from "./pickers";

interface RowProps {
  item: WorkItem;
  project?: Project;
  showProject?: boolean;
  parent?: WorkItem;
}

export function WorkItemRow({ item, project, showProject, parent }: RowProps) {
  const navigate = useNavigate();
  const update = useUpdateWorkItem();
  const patch = (value: Partial<WorkItem>) => update.mutate({ id: item.id, patch: value });
  const done = item.status === "DONE";

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(workItemPath(item.key))}
      onKeyDown={(e) => e.key === "Enter" && navigate(workItemPath(item.key))}
      className="group flex h-11 cursor-pointer items-center gap-2 border-b border-line/60 px-4 transition-colors hover:bg-hover md:px-6"
    >
      <PriorityPicker compact value={item.priority} onChange={(priority) => patch({ priority })} />
      <StatusPicker compact value={item.status} onChange={(status) => patch({ status })} />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span title={TYPE_META[item.type].label} className="hidden shrink-0 sm:inline-flex">
          <TypeIcon type={item.type} size={14} />
        </span>
        <span
          className={cn(
            "truncate text-[13.5px] font-medium",
            done ? "text-fg-subtle" : "text-fg/90 group-hover:text-fg",
          )}
        >
          {item.title}
        </span>
        {item.createdVia !== "MANUAL" && (
          <span
            title={item.createdVia === "AI_VOICE" ? "Created by voice" : "Created with AI"}
            className="shrink-0 text-accent"
          >
            {item.createdVia === "AI_VOICE" ? (
              <Microphone size={12} />
            ) : (
              <Sparkle size={12} weight="fill" />
            )}
          </span>
        )}
        {parent && (
          <span className="hidden min-w-0 shrink items-center gap-1 truncate text-[12px] text-fg-subtle lg:flex">
            <CaretRight size={9} weight="bold" />
            <TypeIcon type={parent.type} size={11} />
            <span className="truncate">{parent.title}</span>
          </span>
        )}
      </span>
      <span className="hidden items-center gap-1.5 md:flex">
        {item.labels.map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
        {showProject && project && <Badge color={project.color}>{project.key}</Badge>}
      </span>
      <span className="hidden w-20 shrink-0 truncate font-mono text-[12px] text-fg-subtle sm:block">
        {item.key}
      </span>
      <span className="w-16 shrink-0 text-right">
        <DueDateLabel dueDate={item.dueDate} done={done} />
      </span>
      <AssigneePicker
        compact
        value={item.assigneeIds}
        onChange={(assigneeIds) => patch({ assigneeIds })}
        memberIds={project?.memberIds}
      />
    </div>
  );
}

interface WorkItemListProps {
  items: WorkItem[] | undefined;
  isLoading: boolean;
  projects?: Map<string, Project>;
  showProject?: boolean;
  onAdd?: (status: WorkItemStatus) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Custom art for the empty state (defaults to the stacked cards). */
  emptyArt?: ReactNode;
}

/** Work items grouped by status, each group collapsible. */
export default function WorkItemList({
  items,
  isLoading,
  projects,
  showProject,
  onAdd,
  emptyTitle = "No work items",
  emptyDescription = "Create one, or describe it in plain words and let AI fill in the details.",
  emptyArt,
}: WorkItemListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["DONE"]));
  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  if (isLoading) return <ListSkeleton rows={8} />;
  if (!items?.length) {
    return (
      <EmptyState icon={Tray} title={emptyTitle} description={emptyDescription} art={emptyArt} />
    );
  }

  const toggle = (status: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  return (
    <div>
      {WORK_ITEM_STATUSES.map((status) => {
        const group = items.filter((item) => item.status === status);
        if (group.length === 0) return null;
        const open = !collapsed.has(status);
        return (
          <section key={status}>
            <header className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-line bg-raised px-4 md:px-6">
              <button
                className="flex items-center gap-2 text-[12.5px] font-medium text-fg"
                onClick={() => toggle(status)}
              >
                <CaretDown
                  size={10}
                  weight="bold"
                  className={cn("text-fg-subtle transition-transform", !open && "-rotate-90")}
                />
                <StatusIcon status={status} />
                {STATUS_META[status].label}
                <span className="text-[12px] font-normal text-fg-subtle tabular-nums">
                  {group.length}
                </span>
              </button>
              <span className="flex-1" />
              {onAdd && (
                <IconButton
                  icon={Plus}
                  label={`Add to ${STATUS_META[status].label}`}
                  onClick={() => onAdd(status)}
                />
              )}
            </header>
            {open &&
              group.map((item) => (
                <WorkItemRow
                  key={item.id}
                  item={item}
                  project={projects?.get(item.projectId)}
                  showProject={showProject}
                  parent={item.parentId ? byId.get(item.parentId) : undefined}
                />
              ))}
          </section>
        );
      })}
    </div>
  );
}

export function CommentCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
      <ChatCircle size={12} />
      {count}
    </span>
  );
}
