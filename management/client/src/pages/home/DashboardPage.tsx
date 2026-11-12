import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Microphone, Plus } from "@phosphor-icons/react";
import dayjs from "dayjs";

import { usePermissions } from "@/features/auth";
import { useDashboard, WeeklyChart, WorkloadCard } from "@/features/dashboard";
import { useProjects } from "@/features/projects";
import {
  childrenMap,
  rollup,
  useCreateWorkItemDialog,
  useWorkItems,
  WorkItemRow,
} from "@/features/workItems";
import { projectPath, ROUTES, workItemPath } from "@/shared/constants/routes";
import { cn } from "@/shared/lib/cn";
import { formatHours, todayIso } from "@/shared/lib/format";
import AiAgent from "@/shared/ui/AiAgent";
import Button from "@/shared/ui/Button";
import { EmptyState, Skeleton } from "@/shared/ui/Display";
import PageHeader from "@/shared/ui/PageHeader";

/** Small uppercase label that separates sections (instead of wrapping each in a card). */
function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex h-7 items-center justify-between gap-3">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One number in the summary line. */
function Figure({ label, value, alert }: { label: string; value: ReactNode; alert?: boolean }) {
  return (
    <div className="flex min-w-[96px] flex-col gap-0.5 px-5 first:pl-0">
      <span
        className={cn(
          "text-[20px] leading-tight font-semibold tracking-[-0.02em] tabular-nums",
          alert ? "text-[#f06a6a]" : "text-fg",
        )}
      >
        {value}
      </span>
      <span className="text-[12px] text-fg-subtle">{label}</span>
    </div>
  );
}

function Bar({ share, color = "var(--fg-subtle)" }: { share: number; color?: string }) {
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-active">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.round(share * 100)}%`, background: color }}
      />
    </span>
  );
}

const FOCUS_TABS = [
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Next 7 days" },
] as const;
type Focus = (typeof FOCUS_TABS)[number]["value"];

export default function DashboardPage() {
  const { can } = usePermissions();
  const { data, isLoading } = useDashboard();
  const { data: projects = [] } = useProjects();
  const { data: mine, isLoading: loadingMine } = useWorkItems({
    assigneeId: "me",
    sort: "due",
    includeSubtasks: true,
  });
  const { data: everything = [] } = useWorkItems({ includeSubtasks: true });
  const openCreate = useCreateWorkItemDialog();
  const [focus, setFocus] = useState<Focus>("today");
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const epics = useMemo(() => {
    const children = childrenMap(everything);
    return everything
      .filter((w) => w.type === "EPIC" && w.status !== "DONE")
      .map((epic) => ({ epic, progress: rollup(epic.id, children) }))
      .sort((a, b) => b.progress.share - a.progress.share)
      .slice(0, 6);
  }, [everything]);

  const today = todayIso();
  const weekAhead = dayjs().add(7, "day").format("YYYY-MM-DD");
  const open = (mine ?? []).filter((w) => w.status !== "DONE" && w.type !== "EPIC");
  const lists: Record<Focus, typeof open> = {
    today: open.filter((w) => w.dueDate === today || w.status === "IN_PROGRESS"),
    overdue: open.filter((w) => w.dueDate && w.dueDate < today),
    upcoming: open.filter((w) => w.dueDate && w.dueDate > today && w.dueDate <= weekAhead),
  };
  const shown = lists[focus];
  const activeProjects = projects.filter((p) => p.status === "ACTIVE" || p.status === "PLANNING");
  const orgView = can("viewOrgDashboard");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard" }]}
        description={dayjs().format("dddd, D MMMM")}
        actions={
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => openCreate({})}>
            Create
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 py-6 md:px-6">
          {/* AI command bar: the one place on this page with the gradient glow. */}
          <div className="ai-surface flex items-center gap-2 rounded-xl bg-raised p-1.5 pl-2">
            <button
              onClick={() => openCreate({ mode: "describe" })}
              className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 text-left"
            >
              <AiAgent size={30} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-muted">
                Describe a task in plain words. AI fills in the type, priority, due date and owner.
              </span>
            </button>
            <button
              onClick={() => openCreate({ mode: "voice" })}
              aria-label="Create by voice"
              title="Create by voice"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <Microphone size={17} />
            </button>
            <Button variant="primary" onClick={() => openCreate({ mode: "describe" })}>
              Create with AI
            </Button>
          </div>

          {/* Summary line */}
          {isLoading || !data ? (
            <Skeleton className="h-12 w-full max-w-2xl" />
          ) : (
            <div className="flex flex-wrap items-center gap-y-3 divide-x divide-line">
              <Figure label="Open" value={data.me.open} />
              <Figure label="In progress" value={data.me.inProgress} />
              <Figure label="Overdue" value={data.me.overdue} alert={data.me.overdue > 0} />
              <Figure label="Due today" value={data.me.dueToday} />
              <Figure label="Done this week" value={data.me.completedThisWeek} />
              <Figure
                label={`Logged of ${formatHours(data.me.estimatedHours)}`}
                value={formatHours(data.me.loggedHours)}
              />
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Your work */}
            <Section
              title="Your work"
              action={
                <div className="flex items-center gap-4" role="tablist">
                  {FOCUS_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      role="tab"
                      aria-selected={focus === tab.value}
                      onClick={() => setFocus(tab.value)}
                      className={cn(
                        "flex items-center gap-1.5 text-[12.5px] font-medium transition-colors",
                        focus === tab.value ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
                      )}
                    >
                      {tab.label}
                      <span className="text-fg-subtle tabular-nums">{lists[tab.value].length}</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="overflow-hidden rounded-lg border border-line [&>div]:px-4! [&>div:last-of-type]:border-b-0">
                {loadingMine ? (
                  <div className="p-4">
                    <Skeleton className="h-32" />
                  </div>
                ) : shown.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle}
                    title={focus === "overdue" ? "Nothing overdue" : "Nothing in this window"}
                    description={
                      focus === "overdue"
                        ? "Everything assigned to you is on time."
                        : "Pick something up from a backlog, or create a task."
                    }
                    className="py-10"
                  />
                ) : (
                  shown
                    .slice(0, 8)
                    .map((item) => (
                      <WorkItemRow
                        key={item.id}
                        item={item}
                        project={projectMap.get(item.projectId)}
                        showProject
                      />
                    ))
                )}
              </div>
              <Link
                to={ROUTES.MY_WORK}
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-fg-subtle transition-colors hover:text-fg"
              >
                All my work
                <ArrowRight size={12} />
              </Link>
            </Section>

            {/* Projects */}
            <Section
              title="Projects"
              action={
                <Link
                  to={ROUTES.PROJECTS}
                  className="text-[12.5px] text-fg-subtle transition-colors hover:text-fg"
                >
                  View all
                </Link>
              }
            >
              <ul className="flex flex-col">
                {activeProjects.map((p) => {
                  const share = p.counts.total ? p.counts.done / p.counts.total : 0;
                  return (
                    <li key={p.id}>
                      <Link
                        to={projectPath(p.key)}
                        className="-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2.5 transition-colors hover:bg-hover"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: p.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                            {p.name}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 pl-4">
                          <Bar share={share} />
                          <span className="w-24 shrink-0 text-right text-[12px] text-fg-subtle tabular-nums">
                            {p.counts.done}/{p.counts.total}
                            {p.counts.overdue ? ` · ${p.counts.overdue} late` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>

          {/* Epics */}
          {epics.length > 0 && (
            <Section title="Epics in progress">
              <div className="overflow-hidden rounded-lg border border-line">
                {epics.map(({ epic, progress }) => {
                  const project = projectMap.get(epic.projectId);
                  return (
                    <Link
                      key={epic.id}
                      to={workItemPath(epic.key)}
                      className="flex h-11 items-center gap-4 border-b border-line/60 px-4 transition-colors last:border-b-0 hover:bg-hover"
                    >
                      <span className="w-20 shrink-0 font-mono text-[12px] text-fg-subtle">
                        {epic.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg/90">
                        {epic.title}
                      </span>
                      {project && (
                        <span className="hidden w-32 shrink-0 items-center gap-1.5 truncate text-[12px] text-fg-subtle sm:flex">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: project.color }}
                          />
                          {project.name}
                        </span>
                      )}
                      <span className="hidden w-40 shrink-0 md:block">
                        <Bar share={progress.share} />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[12px] text-fg-subtle tabular-nums">
                        {progress.done}/{progress.total} · {Math.round(progress.share * 100)}%
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}

          {orgView && data && (
            <Section title="Organisation">
              <div className="flex flex-wrap items-center gap-y-3 divide-x divide-line">
                <Figure label="People" value={data.org.employees} />
                <Figure label="Invited" value={data.org.invited} />
                <Figure label="Teams" value={data.org.teams} />
                <Figure label="Active projects" value={data.org.activeProjects} />
                <Figure label="Managers" value={data.org.projectManagers} />
                <Figure
                  label="Open hours"
                  value={formatHours(data.org.workload.reduce((s, w) => s + w.hours, 0))}
                />
              </div>
            </Section>
          )}

          {data && (
            <div className={cn("grid gap-4", orgView && "lg:grid-cols-2")}>
              <WeeklyChart weekly={data.weekly} />
              {orgView && <WorkloadCard workload={data.org.workload} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
