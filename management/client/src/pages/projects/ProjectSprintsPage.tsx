import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle,
  DotsThree,
  Flag,
  PencilSimple,
  Play,
  Plus,
  Timer,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import dayjs from "dayjs";

import { usePermissions } from "@/features/auth";
import { useOrganization } from "@/features/people";
import {
  burndownOf,
  plannableItems,
  pointsOf,
  SprintModal,
  useCompleteSprint,
  useDeleteSprint,
  useSprints,
  useStartSprint,
  velocityOf,
  workingDaysBetween,
} from "@/features/projects";
import { useWorkItems } from "@/features/workItems";
import { projectPath } from "@/shared/constants/routes";
import { STATUS_META, WORK_ITEM_STATUSES } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { formatDate, formatHours } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import type { Sprint, WorkItem } from "@/shared/types/entities";
import Button from "@/shared/ui/Button";
import { Badge, EmptyState, ListSkeleton, ProgressBar } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Menu from "@/shared/ui/Menu";
import Modal from "@/shared/ui/Modal";
import { StatusIcon } from "@/shared/ui/WorkIcons";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import { useProjectContext } from "./projectContext";

const SPRINT_BADGE = { ACTIVE: "#4cc38a", PLANNED: "#38bdf8", COMPLETED: "#8a8f98" } as const;

/** Work left per day against the even pace line. */
function Burndown({
  sprint,
  items,
  workingDays,
}: {
  sprint: Sprint;
  items: WorkItem[];
  workingDays: number[];
}) {
  const { days, total, unit } = burndownOf(sprint, items, workingDays);
  if (!total || days.length < 2) return null;
  const W = 600;
  const H = 140;
  const pad = { l: 28, r: 8, t: 8, b: 20 };
  const steps = days.length; // one step per day, plus the starting point
  const x = (i: number) => pad.l + (i / steps) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / total) * (H - pad.t - pad.b);
  const ideal = [`${x(0)},${y(total)}`, ...days.map((d, i) => `${x(i + 1)},${y(d.ideal)}`)];
  const actualDays = days.filter((d) => d.actual !== null);
  const actual = [
    `${x(0)},${y(total)}`,
    ...actualDays.map((d, i) => `${x(i + 1)},${y(d.actual!)}`),
  ];
  const left = actualDays.at(-1)?.actual ?? total;
  const expected = actualDays.at(-1)?.ideal ?? total;
  const behind = left > expected + total * 0.1;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-medium text-fg">Burndown</span>
        <span className="text-fg-muted tabular-nums">
          {left} of {total} {unit} left
        </span>
        <span className={cn("tabular-nums", behind ? "text-[#f5a524]" : "text-fg-subtle")}>
          {behind ? `Behind pace by ${Math.round(left - expected)} ${unit}` : "On pace or ahead"}
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-fg-subtle">
          <span className="h-px w-4 border-t border-dashed border-fg-subtle" /> Even pace
        </span>
        <span className="flex items-center gap-1.5 text-fg-subtle">
          <span className="h-0.5 w-4 rounded bg-fg" /> Actual
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full"
        role="img"
        aria-label={`Burndown: ${left} of ${total} ${unit} left`}
      >
        {/* Non-working days shaded */}
        {days.map((d, i) =>
          d.working ? null : (
            <rect
              key={d.date}
              x={x(i)}
              y={pad.t}
              width={x(i + 1) - x(i)}
              height={H - pad.t - pad.b}
              fill="var(--active)"
              opacity={0.5}
            />
          ),
        )}
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(total * t)}
              y2={y(total * t)}
              stroke="var(--line)"
            />
            <text
              x={pad.l - 6}
              y={y(total * t) + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--fg-subtle)"
            >
              {Math.round(total * t)}
            </text>
          </g>
        ))}
        <polyline
          points={ideal.join(" ")}
          fill="none"
          stroke="var(--fg-subtle)"
          strokeDasharray="4 4"
          strokeWidth={1.25}
        />
        <polyline
          points={actual.join(" ")}
          fill="none"
          stroke={behind ? "#f5a524" : "var(--fg)"}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <text x={x(0)} y={H - 4} fontSize="10" fill="var(--fg-subtle)">
          {formatDate(sprint.startDate, "MMM D")}
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">
          {formatDate(sprint.endDate, "MMM D")}
        </text>
      </svg>
    </div>
  );
}

function SprintCard({
  sprint,
  items,
  velocity,
  workingDays,
  canManage,
  onEdit,
  onDelete,
  onComplete,
}: {
  sprint: Sprint;
  /** Everything in the sprint, tasks included. */
  items: WorkItem[];
  velocity: number | null;
  workingDays: number[];
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}) {
  const start = useStartSprint();
  const planned = plannableItems(items);
  const done = planned.filter((w) => w.status === "DONE").length;
  const points = pointsOf(planned);
  const donePoints = pointsOf(planned.filter((w) => w.status === "DONE"));
  const estimate = items.reduce((s, w) => s + (w.estimateHours ?? 0), 0);
  const logged = items.reduce((s, w) => s + w.loggedHours, 0);
  const today = dayjs().startOf("day");
  const totalDays = Math.max(1, workingDaysBetween(sprint.startDate, sprint.endDate, workingDays));
  const daysLeft = today.isAfter(sprint.endDate, "day")
    ? -workingDaysBetween(dayjs(sprint.endDate).add(1, "day"), today, workingDays)
    : workingDaysBetween(
        today.isBefore(sprint.startDate) ? sprint.startDate : today,
        sprint.endDate,
        workingDays,
      );
  const timeUsed =
    sprint.status === "PLANNED" ? 0 : sprint.status === "COMPLETED" ? 1 : 1 - daysLeft / totalDays;
  const progress = planned.length ? done / planned.length : 0;
  const overloaded = sprint.status !== "COMPLETED" && velocity !== null && points > velocity * 1.1;

  return (
    <article className="rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Timer size={16} className="text-fg-muted" />
            <h3 className="text-[13px] font-semibold text-fg">{sprint.name}</h3>
            <Badge color={SPRINT_BADGE[sprint.status]}>
              {sprint.status === "ACTIVE"
                ? "Active"
                : sprint.status === "PLANNED"
                  ? "Planned"
                  : "Completed"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {formatDate(sprint.startDate, "MMM D")} – {formatDate(sprint.endDate, "MMM D, YYYY")}
            {` · ${totalDays} working days`}
            {sprint.status === "ACTIVE" &&
              ` · ${daysLeft < 0 ? `${-daysLeft} working days over` : daysLeft === 0 ? "ends today" : `${daysLeft} working days left`}`}
          </p>
          {sprint.goal && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-fg">
              <Flag size={14} className="mt-0.5 shrink-0 text-accent" />
              {sprint.goal}
            </p>
          )}
        </div>
        {canManage && sprint.status === "PLANNED" && (
          <Button
            size="sm"
            icon={Play}
            loading={start.isPending}
            onClick={() =>
              start.mutate(sprint.id, {
                onSuccess: () => toast.success(`${sprint.name} started`),
                onError: (e) => toast.error(getApiErrorMessage(e)),
              })
            }
          >
            Start sprint
          </Button>
        )}
        {canManage && sprint.status === "ACTIVE" && (
          <Button size="sm" variant="primary" icon={CheckCircle} onClick={onComplete}>
            Complete sprint
          </Button>
        )}
        {canManage && sprint.status !== "COMPLETED" && (
          <Menu
            align="right"
            trigger={({ toggle }) => (
              <IconButton icon={DotsThree} label="Sprint actions" onClick={toggle} />
            )}
            items={[
              { label: "Edit sprint", icon: PencilSimple, onSelect: onEdit },
              ...(sprint.status === "PLANNED"
                ? [{ label: "Delete sprint", icon: Trash, danger: true, onSelect: onDelete }]
                : []),
            ]}
          />
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-fg-muted">Items done</span>
            <span className="text-fg tabular-nums">
              {done}/{planned.length}
            </span>
          </div>
          <ProgressBar
            value={progress}
            color={sprint.status === "ACTIVE" && progress < timeUsed - 0.15 ? "#f5a524" : undefined}
          />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-fg-muted">
              {sprint.status === "COMPLETED" ? "Points done" : "Points"}
            </span>
            <span
              className={cn("tabular-nums", overloaded ? "text-[#f5a524]" : "text-fg")}
              title={velocity !== null ? `Team velocity: ${velocity} points per sprint` : undefined}
            >
              {sprint.status === "COMPLETED"
                ? donePoints
                : `${donePoints}/${points}${velocity !== null ? ` · velocity ${velocity}` : ""}`}
            </span>
          </div>
          <ProgressBar
            value={points ? donePoints / points : 0}
            color={overloaded ? "#f5a524" : undefined}
          />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-fg-muted">Time used</span>
            <span className="text-fg tabular-nums">{Math.round(timeUsed * 100)}%</span>
          </div>
          <ProgressBar value={timeUsed} color="var(--fg-subtle)" />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-fg-muted">Hours</span>
            <span className="text-fg tabular-nums">
              {formatHours(logged)} / {formatHours(estimate)}
            </span>
          </div>
          <ProgressBar
            value={estimate ? logged / estimate : 0}
            color={logged > estimate ? "#f06a6a" : "#4cc38a"}
          />
        </div>
      </div>

      {overloaded && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-[#f5a524]">
          <Warning size={14} className="mt-px shrink-0" />
          {points} points planned, but the team usually finishes about {velocity}. Consider moving
          some stories back to the backlog.
        </p>
      )}

      {sprint.status === "ACTIVE" && (
        <Burndown sprint={sprint} items={items} workingDays={workingDays} />
      )}

      <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3">
        {WORK_ITEM_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
            <StatusIcon status={s} size={12} />
            {STATUS_META[s].label}
            <span className="text-fg">{planned.filter((w) => w.status === s).length}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

export default function ProjectSprintsPage() {
  const project = useProjectContext();
  const { can } = usePermissions();
  const { data: organization } = useOrganization();
  const { data: sprints, isLoading } = useSprints(project.id);
  const { data: items = [] } = useWorkItems({ projectId: project.id });
  const complete = useCompleteSprint();
  const remove = useDeleteSprint();
  const [planning, setPlanning] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [moveTo, setMoveTo] = useState("backlog");
  const canManage = can("manageSprints");
  const workingDays = organization?.workingDays ?? [1, 2, 3, 4, 5];

  if (isLoading) return <ListSkeleton />;
  const all = sprints ?? [];
  const ordered = [...all].sort((a, b) => {
    const rank = { ACTIVE: 0, PLANNED: 1, COMPLETED: 2 };
    return rank[a.status] - rank[b.status] || a.startDate.localeCompare(b.startDate);
  });
  const last = [...all].sort((a, b) => a.endDate.localeCompare(b.endDate)).at(-1);
  const velocity = velocityOf(all, items);
  const plannedSprints = all
    .filter((s) => s.status === "PLANNED")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const openLeft = closing
    ? plannableItems(items).filter((w) => w.sprintId === closing.id && w.status !== "DONE").length
    : 0;

  function startClosing(sprint: Sprint) {
    setMoveTo(plannedSprints[0]?.id ?? "backlog");
    setClosing(sprint);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-fg-muted">
          Plan stories and bugs into fixed periods from the{" "}
          <Link to={projectPath(project.key, "backlog")} className="text-accent hover:underline">
            backlog
          </Link>
          . Their tasks come along.
        </p>
        <div className="flex items-center gap-4">
          <span
            className="text-[12.5px] text-fg-muted"
            title={velocity.recent.map((r) => `${r.name}: ${r.points} points`).join("\n")}
          >
            Velocity{" "}
            <span className="font-semibold text-fg tabular-nums">{velocity.average ?? "—"}</span>{" "}
            {velocity.average !== null &&
              `pts · last ${velocity.recent.length} sprint${velocity.recent.length === 1 ? "" : "s"}`}
          </span>
          {canManage && (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setPlanning(true)}>
              Plan sprint
            </Button>
          )}
        </div>
      </div>
      {ordered.length === 0 ? (
        <EmptyState
          icon={Timer}
          title="No sprints yet"
          description="Create a sprint, then move stories into it from the backlog."
        />
      ) : (
        ordered.map((sprint) => (
          <SprintCard
            key={sprint.id}
            sprint={sprint}
            items={items.filter((w) => w.sprintId === sprint.id)}
            velocity={velocity.average}
            workingDays={workingDays}
            canManage={canManage}
            onEdit={() => setEditing(sprint)}
            onDelete={() => setDeleting(sprint)}
            onComplete={() => startClosing(sprint)}
          />
        ))
      )}

      {planning && (
        <SprintModal
          projectId={project.id}
          suggestedName={`${project.key} Sprint ${all.length + 1}`}
          suggestedStart={
            last
              ? dayjs(last.endDate).add(1, "day").format("YYYY-MM-DD")
              : dayjs().format("YYYY-MM-DD")
          }
          onClose={() => setPlanning(false)}
        />
      )}
      {editing && <SprintModal sprint={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <Modal
          open
          size="sm"
          onClose={() => setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          description="Its stories and bugs go back to the backlog. Nothing else is lost."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(deleting.id, {
                    onSuccess: () => {
                      toast.success(`${deleting.name} deleted`);
                      setDeleting(null);
                    },
                    onError: (e) => toast.error(getApiErrorMessage(e)),
                  })
                }
              >
                Delete sprint
              </Button>
            </>
          }
        >
          <span />
        </Modal>
      )}

      {closing && (
        <Modal
          open
          size="sm"
          onClose={() => setClosing(null)}
          title={`Complete ${closing.name}?`}
          description={
            openLeft
              ? `${openLeft} unfinished stor${openLeft === 1 ? "y or bug" : "ies and bugs"}. Their tasks move with them.`
              : "All work in this sprint is done."
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setClosing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={complete.isPending}
                onClick={() =>
                  complete.mutate(
                    { id: closing.id, moveTo },
                    {
                      onSuccess: (r) => {
                        toast.success(`${closing.name} completed`, {
                          description: r.moved
                            ? `${r.moved} items moved to ${r.movedTo}`
                            : undefined,
                        });
                        setClosing(null);
                      },
                      onError: (e) => toast.error(getApiErrorMessage(e)),
                    },
                  )
                }
              >
                Complete sprint
              </Button>
            </>
          }
        >
          {openLeft > 0 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">
                Move unfinished work to
              </legend>
              {[
                ...plannedSprints.map((s) => ({
                  value: s.id,
                  label: s.name,
                  hint: `${formatDate(s.startDate, "MMM D")} – ${formatDate(s.endDate, "MMM D")}`,
                })),
                { value: "backlog", label: "Backlog", hint: "Plan it again later" },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] transition-colors",
                    moveTo === option.value
                      ? "border-line-strong bg-active text-fg"
                      : "border-line text-fg-muted hover:bg-hover",
                  )}
                >
                  <input
                    type="radio"
                    name="moveTo"
                    value={option.value}
                    checked={moveTo === option.value}
                    onChange={() => setMoveTo(option.value)}
                    className="accent-[var(--fg)]"
                  />
                  <span className="flex-1">{option.label}</span>
                  <span className="text-xs text-fg-subtle">{option.hint}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <span />
          )}
        </Modal>
      )}
    </div>
  );
}
