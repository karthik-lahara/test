import { type DragEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Microphone, Plus, Sparkle } from "@phosphor-icons/react";

import { workItemPath } from "@/shared/constants/routes";
import { STATUS_META, WORK_ITEM_STATUSES, type WorkItemStatus } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { formatHours } from "@/shared/lib/format";
import type { Project, WorkItem } from "@/shared/types/entities";
import { Badge, Skeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import { StatusIcon, TypeBadge, TypeIcon } from "@/shared/ui/WorkIcons";

import { useReorderWorkItems, useUpdateWorkItem } from "../queries/workItems.queries";
import { AssigneePicker, DueDateLabel, PriorityPicker } from "./pickers";

function Card({
  item,
  project,
  parent,
  onDragStart,
}: {
  item: WorkItem;
  project?: Project;
  parent?: WorkItem;
  onDragStart: (e: DragEvent) => void;
}) {
  const navigate = useNavigate();
  const update = useUpdateWorkItem();
  const patch = (value: Partial<WorkItem>) => update.mutate({ id: item.id, patch: value });
  const progress = item.estimateHours ? Math.min(1, item.loggedHours / item.estimateHours) : 0;

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onClick={() => navigate(workItemPath(item.key))}
      className="group cursor-pointer rounded-lg border border-line bg-raised p-3 shadow-card transition-all hover:border-line-strong hover:bg-hover/60 active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <TypeBadge type={item.type} />
        <span className="font-mono text-[12px]">{item.key}</span>
        {item.createdVia !== "MANUAL" && (
          <span className="text-accent" title="Created with AI">
            {item.createdVia === "AI_VOICE" ? <Microphone size={11} /> : <Sparkle size={11} />}
          </span>
        )}
        <span className="flex-1" />
        <AssigneePicker
          compact
          value={item.assigneeIds}
          onChange={(assigneeIds) => patch({ assigneeIds })}
          memberIds={project?.memberIds}
        />
      </div>
      <p className="mt-2 line-clamp-3 text-[12.5px] leading-snug font-medium text-fg">
        {item.title}
      </p>
      {parent && (
        <p className="mt-1.5 flex items-center gap-1 truncate text-[12px] text-fg-subtle">
          <TypeIcon type={parent.type} size={11} />
          <span className="truncate">{parent.title}</span>
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
        <PriorityPicker
          compact
          value={item.priority}
          onChange={(priority) => patch({ priority })}
        />
        <DueDateLabel dueDate={item.dueDate} done={item.status === "DONE"} />
        {item.labels.map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
      </div>
      {item.estimateHours ? (
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-fg-subtle">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-active">
            <div
              className={cn(
                "h-full rounded-full",
                item.loggedHours > item.estimateHours ? "bg-coral" : "bg-accent",
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {formatHours(item.loggedHours)} / {formatHours(item.estimateHours)}
        </div>
      ) : null}
    </article>
  );
}

interface BoardProps {
  items: WorkItem[] | undefined;
  /** Every item in the project, used to show each card's parent. */
  lookup?: WorkItem[];
  isLoading: boolean;
  project?: Project;
  onAdd?: (status: WorkItemStatus) => void;
}

/** Columns by status. Drag a card to change its status or its place in the column. */
export default function Board({ items, lookup, isLoading, project, onAdd }: BoardProps) {
  const byId = new Map((lookup ?? items ?? []).map((i) => [i.id, i]));
  const update = useUpdateWorkItem();
  const reorder = useReorderWorkItems();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: WorkItemStatus; index: number } | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-3 p-4">
        {WORK_ITEM_STATUSES.map((s) => (
          <Skeleton key={s} className="h-96 w-72 shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  const columns = WORK_ITEM_STATUSES.map((status) => ({
    status,
    items: (items ?? []).filter((item) => item.status === status).sort((a, b) => a.order - b.order),
  }));

  function drop(status: WorkItemStatus) {
    const dragged = items?.find((i) => i.id === dragId);
    setDragId(null);
    setOver(null);
    if (!dragged) return;
    const column = columns
      .find((c) => c.status === status)!
      .items.filter((i) => i.id !== dragged.id);
    const index = over?.status === status ? over.index : column.length;
    column.splice(index, 0, dragged);
    if (dragged.status !== status) update.mutate({ id: dragged.id, patch: { status } });
    reorder.mutate({ projectId: dragged.projectId, ids: column.map((i) => i.id) });
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3 md:px-6 md:py-4">
      {columns.map(({ status, items: columnItems }) => (
        <section
          key={status}
          onDragOver={(e) => {
            e.preventDefault();
            if (over?.status !== status) setOver({ status, index: columnItems.length });
          }}
          onDrop={() => drop(status)}
          className={cn(
            "flex w-[290px] shrink-0 flex-col rounded-lg bg-raised/60 transition-colors",
            dragId && over?.status === status && "bg-accent-soft ring-1 ring-accent/40",
          )}
        >
          <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
            <StatusIcon status={status} />
            <span className="text-[12.5px] font-medium text-fg">{STATUS_META[status].label}</span>
            <span className="text-[12px] text-fg-subtle tabular-nums">{columnItems.length}</span>
            <span className="flex-1" />
            {onAdd && (
              <IconButton
                icon={Plus}
                label={`Add to ${STATUS_META[status].label}`}
                onClick={() => onAdd(status)}
              />
            )}
          </header>
          <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {columnItems.map((item, index) => (
              <div
                key={item.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > rect.top + rect.height / 2;
                  setOver({ status, index: index + (after ? 1 : 0) });
                }}
                className={cn(dragId === item.id && "opacity-40")}
              >
                {over?.status === status &&
                  over.index === index &&
                  dragId &&
                  dragId !== item.id && <div className="mb-2 h-0.5 rounded bg-accent" />}
                <Card
                  item={item}
                  project={project}
                  parent={item.parentId ? byId.get(item.parentId) : undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(item.id);
                  }}
                />
              </div>
            ))}
            {over?.status === status && over.index === columnItems.length && dragId && (
              <div className="h-0.5 rounded bg-accent" />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
