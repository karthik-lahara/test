import { type ReactNode, useState } from "react";
import {
  ArrowRight,
  CalendarBlank,
  ChartLine,
  Flag,
  UsersThree,
} from "@phosphor-icons/react";

import { useMemberMap, useTeams } from "@/features/people";
import {
  PRIORITIES,
  PRIORITY_META,
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
} from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { formatDate } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import type { Project } from "@/shared/types/entities";
import Avatar, { AvatarStack } from "@/shared/ui/Avatar";
import { Card, ProgressRing, Skeleton } from "@/shared/ui/Display";
import Picker from "@/shared/ui/Picker";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import PropertyButton from "@/shared/ui/PropertyButton";
import { Tabs } from "@/shared/ui/Tabs";
import { Dot, PriorityIcon } from "@/shared/ui/WorkIcons";

import { targetDateInfo } from "../projectDisplay";
import { useProjectProgress, useUpdateProject } from "../queries/projects.queries";
import ProgressChart from "./ProgressChart";

/** The server's limit for a project description. */
const DESCRIPTION_MAX = 500;

const dateInputClass =
  "h-7 rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] text-fg hover:border-line focus:border-line focus:outline-none [color-scheme:light_dark]";

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 flex-col gap-1 sm:flex-row sm:items-start sm:gap-6">
      <span className="w-28 shrink-0 pt-1.5 text-[12.5px] text-fg-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

export default function ProjectOverview({
  project,
  canEdit,
}: {
  project: Project;
  canEdit: boolean;
}) {
  const members = useMemberMap();
  const { data: teams = [] } = useTeams();
  const { data: progress, isLoading } = useProjectProgress(project.key);
  const update = useUpdateProject();
  const [breakdown, setBreakdown] = useState<"assignees" | "labels">("assignees");
  const [description, setDescription] = useState(project.description);

  const patch = (value: Partial<Project>) => update.mutate({ id: project.id, patch: value });
  const lead = project.leadId ? members.get(project.leadId) : null;
  const team = teams.find((t) => t.id === project.teamId);
  const share = project.counts.total ? project.counts.done / project.counts.total : 0;
  const target = targetDateInfo(project);

  /** Saves the new start or target date, unless it would end before it starts. */
  const changeDates = (change: { startDate?: string | null; endDate?: string | null }) => {
    const start = change.startDate !== undefined ? change.startDate : project.startDate;
    const end = change.endDate !== undefined ? change.endDate : project.endDate;
    if (start && end && end < start) {
      toast.error("The target date can't be before the start date");
      return;
    }
    patch(change);
  };

  return (
    <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 xl:px-6 xl:pt-6">
        <div className="flex items-center gap-3">
          <ProjectIcon color={project.color} size={28} />
          <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
            {project.key}
          </span>
        </div>
        <h1 className="mt-4">
          <input
            defaultValue={project.name}
            disabled={!canEdit}
            aria-label="Project name"
            maxLength={100}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name === project.name) return;
              if (name.length < 2) {
                e.target.value = project.name;
                toast.error("A project name needs at least 2 characters");
                return;
              }
              patch({ name });
            }}
            className="-ml-1.5 w-full rounded-md bg-transparent px-1.5 text-2xl font-semibold tracking-tight text-fg hover:bg-hover/50 focus:bg-hover/50 focus:outline-none disabled:hover:bg-transparent"
          />
        </h1>
        <input
          defaultValue={project.summary}
          disabled={!canEdit}
          aria-label="Summary"
          maxLength={150}
          placeholder="Add a short summary…"
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={(e) => e.target.value !== project.summary && patch({ summary: e.target.value })}
          className="mt-1 -ml-1.5 w-full rounded-md bg-transparent px-1.5 py-0.5 text-[14px] text-fg-muted placeholder:text-fg-subtle hover:bg-hover/50 focus:bg-hover/50 focus:outline-none disabled:hover:bg-transparent"
        />

        <div className="mt-8 flex flex-col gap-2">
          <PropertyRow label="Properties">
            <Picker
              searchable={false}
              value={[project.status]}
              onChange={([v]) => patch({ status: v as Project["status"] })}
              options={PROJECT_STATUSES.map((s) => ({
                value: s,
                label: PROJECT_STATUS_META[s].label,
                icon: <Dot color={PROJECT_STATUS_META[s].color} />,
              }))}
              trigger={({ toggle }) => (
                <PropertyButton onClick={toggle} disabled={!canEdit}>
                  <Dot color={PROJECT_STATUS_META[project.status].color} />
                  {PROJECT_STATUS_META[project.status].label}
                </PropertyButton>
              )}
            />
            <Picker
              searchable={false}
              value={[project.priority]}
              onChange={([v]) => patch({ priority: v as Project["priority"] })}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: PRIORITY_META[p].label,
                icon: <PriorityIcon priority={p} />,
              }))}
              trigger={({ toggle }) => (
                <PropertyButton onClick={toggle} disabled={!canEdit}>
                  <PriorityIcon priority={project.priority} />
                  {PRIORITY_META[project.priority].label}
                </PropertyButton>
              )}
            />
            <Picker
              value={project.leadId ? [project.leadId] : []}
              onChange={([v]) => patch({ leadId: v })}
              options={project.memberIds.flatMap((id) => {
                const m = members.get(id);
                return m
                  ? [{ value: id, label: m.name, icon: <Avatar person={m} size={16} /> }]
                  : [];
              })}
              trigger={({ toggle }) => (
                <PropertyButton onClick={toggle} disabled={!canEdit} muted={!lead}>
                  <Avatar person={lead} size={18} />
                  {lead?.name ?? "No lead"}
                </PropertyButton>
              )}
            />
            <AvatarStack
              people={project.memberIds.flatMap((id) => members.get(id) ?? [])}
              size={20}
              max={4}
            />
          </PropertyRow>
          <PropertyRow label="Timeline">
            {canEdit ? (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg">
                <CalendarBlank size={15} className="ml-1.5 text-fg-muted" />
                <input
                  type="date"
                  aria-label="Start date"
                  value={project.startDate ?? ""}
                  max={project.endDate ?? undefined}
                  onChange={(e) => changeDates({ startDate: e.target.value || null })}
                  className={dateInputClass}
                />
                <ArrowRight size={12} className="text-fg-subtle" />
                <input
                  type="date"
                  aria-label="Target date"
                  value={project.endDate ?? ""}
                  min={project.startDate ?? undefined}
                  onChange={(e) => changeDates({ endDate: e.target.value || null })}
                  className={dateInputClass}
                />
              </span>
            ) : (
              <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[12.5px] text-fg">
                <CalendarBlank size={15} className="text-fg-muted" />
                {project.startDate ? formatDate(project.startDate, "MMM D") : "No start"}
                <ArrowRight size={12} className="text-fg-subtle" />
                {project.endDate ? formatDate(project.endDate, "MMM D, YYYY") : "No end"}
              </span>
            )}
            {target?.hint && (
              <span className={cn("text-xs", target.late ? "text-[#e5484d]" : "text-fg-subtle")}>
                {target.hint}
              </span>
            )}
            {team && (
              <span className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[12.5px] text-fg">
                <UsersThree size={15} style={{ color: team.color }} />
                {team.name}
              </span>
            )}
          </PropertyRow>
          <PropertyRow label="Progress">
            <span className="px-1.5 text-xs text-fg-muted">
              {project.counts.overdue} overdue · {project.counts.blocked} blocked ·{" "}
              {Math.round(share * 100)}% complete
            </span>
          </PropertyRow>
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12.5px] font-medium text-fg-muted">Description</h2>
            {canEdit && (
              <span
                className={cn(
                  "text-[11.5px] tabular-nums",
                  description.length > DESCRIPTION_MAX - 50 ? "text-[#d9860b]" : "text-fg-subtle",
                )}
              >
                {description.length}/{DESCRIPTION_MAX}
              </span>
            )}
          </div>
          <textarea
            value={description}
            disabled={!canEdit}
            aria-label="Description"
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== project.description && patch({ description })}
            placeholder="Add description…"
            rows={6}
            className="w-full resize-none rounded-lg border border-transparent bg-transparent p-2 -ml-2 text-[13px] leading-relaxed text-fg placeholder:text-fg-subtle hover:border-line focus:outline-none field-glow"
          />
        </div>
      </div>

      <Card
        className="h-fit"
        title={
          <span className="flex items-center gap-2">
            <Flag size={14} className="text-fg-muted" />
            Progress
          </span>
        }
      >
        <div className="px-4 pb-4">
          {isLoading || !progress ? (
            <Skeleton className="h-52" />
          ) : progress.points.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-lg border border-dashed border-line text-center">
              <ChartLine size={22} className="text-fg-subtle" />
              <p className="mt-2 text-[12.5px] font-medium text-fg">No progress to chart yet</p>
              <p className="mt-0.5 max-w-60 text-xs text-fg-muted">
                The chart fills in as work items are added and completed.
              </p>
            </div>
          ) : (
            <ProgressChart points={progress.points} endDate={progress.endDate} />
          )}
        </div>
        <div className="border-t border-line px-4 py-3">
          <Tabs
            value={breakdown}
            onChange={(v) => setBreakdown(v as typeof breakdown)}
            items={[
              { value: "assignees", label: "Assignees" },
              { value: "labels", label: "Labels" },
            ]}
          />
          <ul className="mt-3 flex flex-col">
            {breakdown === "assignees"
              ? progress?.byAssignee.map((row) => {
                  const m = row.memberId ? members.get(row.memberId) : null;
                  return (
                    <li
                      key={row.memberId ?? "none"}
                      className="flex items-center gap-2.5 py-1.5 text-[12.5px]"
                    >
                      <Avatar person={m} size={20} />
                      <span className={m ? "flex-1 text-fg" : "flex-1 text-fg-muted"}>
                        {m?.name ?? "No assignee"}
                      </span>
                      <ProgressRing value={row.total ? row.done / row.total : 0} />
                      <span className="w-20 text-right text-xs text-fg-muted tabular-nums">
                        {row.total ? Math.round((row.done / row.total) * 100) : 0}% of {row.total}
                      </span>
                    </li>
                  );
                })
              : progress?.byLabel.map((row) => (
                  <li key={row.label} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
                    <Dot color="var(--fg-subtle)" />
                    <span className="flex-1 text-fg">{row.label}</span>
                    <ProgressRing value={row.total ? row.done / row.total : 0} />
                    <span className="w-20 text-right text-xs text-fg-muted tabular-nums">
                      {row.done} of {row.total}
                    </span>
                  </li>
                ))}
          </ul>
          {progress &&
            (breakdown === "assignees" ? progress.byAssignee : progress.byLabel).length === 0 && (
              <p className="py-3 text-center text-xs text-fg-subtle">
                {breakdown === "assignees"
                  ? "No assigned work items yet."
                  : "No labelled work items yet."}
              </p>
            )}
        </div>
      </Card>
    </div>
  );
}
