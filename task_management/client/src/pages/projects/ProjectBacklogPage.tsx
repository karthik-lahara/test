import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CaretDown,
  CaretRight,
  DotsSixVertical,
  Plus,
  Timer,
} from "@phosphor-icons/react";
import dayjs from "dayjs";

import { usePermissions } from "@/features/auth";
import { plannableItems, pointsOf, SprintModal, useSprints, velocityOf } from "@/features/projects";
import {
  ancestorsOf,
  applyFilters,
  AssigneePicker,
  EMPTY_FILTERS,
  FilterBar,
  type FilterValues,
  PriorityPicker,
  useCreateWorkItemDialog,
  useReorderWorkItems,
  useUpdateWorkItem,
  useWorkItems,
} from "@/features/workItems";
import { workItemPath } from "@/shared/constants/routes";
import { cn } from "@/shared/lib/cn";
import { formatDate, formatHours } from "@/shared/lib/format";
import type { Project, Sprint, WorkItem } from "@/shared/types/entities";
import Button from "@/shared/ui/Button";
import { Badge, ListSkeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Menu from "@/shared/ui/Menu";
import Toggle from "@/shared/ui/Toggle";
import { StatusIcon, TypeBadge, TypeIcon } from "@/shared/ui/WorkIcons";

import { useProjectContext } from "./projectContext";

interface SectionProps {
  title: string;
  subtitle?: string;
  sprintId: string | null;
  items: WorkItem[];
  epics: Map<string, WorkItem>;
  epicOf: (item: WorkItem) => WorkItem | undefined;
  targets: Sprint[];
  project: Project;
  groupByEpic: boolean;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDropItem: (sprintId: string | null, beforeId: string | null) => void;
  action?: ReactNode;
  /** How many tasks each story or bug carries with it. */
  childCount: Map<string, number>;
  /** Average points per sprint, to warn when a sprint is planned above it. */
  velocity?: number | null;
}

function BacklogSection({
  title,
  subtitle,
  sprintId,
  items,
  epics,
  epicOf,
  targets,
  project,
  groupByEpic,
  dragId,
  setDragId,
  onDropItem,
  action,
  childCount,
  velocity,
}: SectionProps) {
  const navigate = useNavigate();
  const update = useUpdateWorkItem();
  const [open, setOpen] = useState(true);
  const [overId, setOverId] = useState<string | null | "end">(null);
  const hours = items.reduce((s, w) => s + (w.estimateHours ?? 0), 0);
  const points = pointsOf(items);
  const overloaded = sprintId !== null && velocity != null && points > velocity * 1.1;

  const groups: Array<[string, WorkItem[]]> = groupByEpic
    ? Array.from(
        items.reduce((map, item) => {
          const key = epicOf(item)?.id ?? "none";
          map.set(key, [...(map.get(key) ?? []), item]);
          return map;
        }, new Map<string, WorkItem[]>()),
      )
    : [["all", items]];

  return (
    <section
      className={cn("rounded-lg border border-line bg-panel", dragId && "transition-colors")}
      onDragOver={(e) => {
        e.preventDefault();
        if (overId === null) setOverId("end");
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOverId(null)}
      onDrop={() => {
        onDropItem(sprintId, overId === "end" ? null : overId);
        setOverId(null);
      }}
    >
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-[12.5px] font-medium text-fg"
        >
          {open ? (
            <CaretDown size={11} className="text-fg-subtle" />
          ) : (
            <CaretRight size={11} className="text-fg-subtle" />
          )}
          {title}
        </button>
        {subtitle && <span className="text-xs text-fg-subtle">{subtitle}</span>}
        <span className="text-xs text-fg-subtle">
          · {items.length} items · {formatHours(hours)}
          {points ? " · " : ""}
          {points ? (
            <span
              className={overloaded ? "text-[#f5a524]" : ""}
              title={velocity != null ? `Team velocity: ${velocity} points per sprint` : undefined}
            >
              {sprintId !== null && velocity != null
                ? `${points} of ~${velocity} pts${overloaded ? ", over capacity" : ""}`
                : `${points} pts`}
            </span>
          ) : null}
        </span>
        <span className="flex-1" />
        {action}
      </header>
      {open && (
        <div
          className={cn(
            "min-h-10 border-t border-line",
            dragId && overId === "end" && "bg-accent-soft",
          )}
        >
          {items.length === 0 && (
            <p className="px-4 py-3 text-xs text-fg-subtle">Drag work items here.</p>
          )}
          {groups.map(([key, group]) => (
            <div key={key}>
              {groupByEpic && (
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-fg-muted">
                  <TypeIcon type="EPIC" size={12} />
                  {key === "none" ? "No epic" : epics.get(key)?.title}
                </div>
              )}
              {group.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(item.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOverId(item.id);
                  }}
                  onClick={() => navigate(workItemPath(item.key))}
                  className={cn(
                    "group flex h-10 cursor-pointer items-center gap-1.5 border-b border-line/70 px-2 text-[12.5px] last:border-b-0 hover:bg-hover/60",
                    dragId === item.id && "opacity-40",
                    dragId && overId === item.id && "border-t-2 border-t-accent",
                  )}
                >
                  <DotsSixVertical
                    size={14}
                    className="cursor-grab text-fg-subtle opacity-0 group-hover:opacity-100"
                  />
                  <TypeBadge type={item.type} />
                  <span className="w-16 shrink-0 font-mono text-xs text-fg-subtle">{item.key}</span>
                  <StatusIcon status={item.status} />
                  <span className="min-w-0 flex-1 truncate text-fg">{item.title}</span>
                  {childCount.get(item.id) ? (
                    <span
                      className="shrink-0 text-xs text-fg-subtle"
                      title="Its tasks move with it between sprints"
                    >
                      {childCount.get(item.id)} task{childCount.get(item.id) === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {!groupByEpic && epicOf(item) && (
                    <span className="hidden lg:inline">
                      <Badge>{epicOf(item)!.title}</Badge>
                    </span>
                  )}
                  {item.storyPoints ? (
                    <span className="rounded bg-active px-1.5 text-[12px] text-fg-muted">
                      {item.storyPoints}
                    </span>
                  ) : null}
                  <span className="w-12 text-right text-xs text-fg-subtle tabular-nums">
                    {formatHours(item.estimateHours)}
                  </span>
                  <PriorityPicker
                    compact
                    value={item.priority}
                    onChange={(priority) => update.mutate({ id: item.id, patch: { priority } })}
                  />
                  <AssigneePicker
                    compact
                    value={item.assigneeIds}
                    onChange={(assigneeIds) =>
                      update.mutate({ id: item.id, patch: { assigneeIds } })
                    }
                    memberIds={project.memberIds}
                  />
                  <span onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={({ toggle }) => (
                        <IconButton icon={ArrowRight} label="Move to" onClick={toggle} />
                      )}
                      items={[
                        ...targets
                          .filter((s) => s.id !== sprintId)
                          .map((s) => ({
                            label: `Move to ${s.name}`,
                            icon: Timer,
                            onSelect: () =>
                              update.mutate({ id: item.id, patch: { sprintId: s.id } }),
                          })),
                        ...(sprintId
                          ? [
                              {
                                label: "Move to backlog",
                                onSelect: () =>
                                  update.mutate({ id: item.id, patch: { sprintId: null } }),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProjectBacklogPage() {
  const project = useProjectContext();
  const { can } = usePermissions();
  const openCreate = useCreateWorkItemDialog();
  const update = useUpdateWorkItem();
  const reorder = useReorderWorkItems();
  const { data: sprints = [] } = useSprints(project.id);
  const { data, isLoading } = useWorkItems({ projectId: project.id, sort: "order" });
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [groupByEpic, setGroupByEpic] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  const all = data ?? [];
  const epics = new Map(all.filter((w) => w.type === "EPIC").map((e) => [e.id, e]));
  const byId = new Map(all.map((w) => [w.id, w]));
  // Plan stories, bugs and stand-alone tasks; a story's tasks go wherever the story goes.
  const visible = applyFilters(plannableItems(all), filters) ?? [];
  const childCount = new Map<string, number>();
  for (const w of all)
    if (w.parentId) childCount.set(w.parentId, (childCount.get(w.parentId) ?? 0) + 1);
  const velocity = velocityOf(sprints, all).average;
  const openSprints = sprints.filter((s) => s.status !== "COMPLETED");
  const backlog = visible.filter((w) => !w.sprintId && w.status !== "DONE");
  const lastSprint = sprints[sprints.length - 1];

  function onDropItem(sprintId: string | null, beforeId: string | null) {
    const dragged = all.find((w) => w.id === dragId);
    setDragId(null);
    if (!dragged) return;
    if (dragged.sprintId !== sprintId) update.mutate({ id: dragged.id, patch: { sprintId } });
    const list = visible.filter((w) => w.sprintId === sprintId && w.id !== dragged.id);
    const index = beforeId ? list.findIndex((w) => w.id === beforeId) : list.length;
    list.splice(index < 0 ? list.length : index, 0, dragged);
    reorder.mutate({ projectId: dragged.projectId, ids: list.map((w) => w.id) });
  }

  const shared = {
    epics,
    epicOf: (item: WorkItem) => ancestorsOf(item, byId).find((a) => a.type === "EPIC"),
    targets: openSprints,
    project,
    groupByEpic,
    dragId,
    setDragId,
    onDropItem,
    childCount,
    velocity,
  };

  return (
    <>
      <FilterBar
        value={filters}
        onChange={setFilters}
        memberIds={project.memberIds}
        right={
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Toggle checked={groupByEpic} onChange={setGroupByEpic} label="Group by epic" />
            Group by epic
          </label>
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : (
        <div className="flex flex-col gap-4 p-3 md:p-5">
          {openSprints.map((sprint) => (
            <BacklogSection
              key={sprint.id}
              title={sprint.name}
              subtitle={`${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}${sprint.status === "ACTIVE" ? " · Active" : ""}`}
              sprintId={sprint.id}
              items={visible.filter((w) => w.sprintId === sprint.id)}
              {...shared}
            />
          ))}
          <BacklogSection
            title="Backlog"
            subtitle="Unplanned work"
            sprintId={null}
            items={backlog}
            {...shared}
            action={
              <div className="flex gap-1.5">
                {can("manageSprints") && (
                  <Button size="sm" icon={Timer} onClick={() => setPlanning(true)}>
                    Plan sprint
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  icon={Plus}
                  onClick={() => openCreate({ projectId: project.id, sprintId: null })}
                >
                  Add
                </Button>
              </div>
            }
          />
        </div>
      )}
      {planning && (
        <SprintModal
          projectId={project.id}
          suggestedName={`${project.key} Sprint ${sprints.length + 1}`}
          suggestedStart={
            lastSprint
              ? dayjs(lastSprint.endDate).add(1, "day").format("YYYY-MM-DD")
              : dayjs().format("YYYY-MM-DD")
          }
          onClose={() => setPlanning(false)}
        />
      )}
    </>
  );
}
