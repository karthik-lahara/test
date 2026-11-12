import type { KeyboardEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarBlank, Cube } from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import { projectPath } from "@/shared/constants/routes";
import { PRIORITY_META, PROJECT_STATUS_META } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import type { Project } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import {
  EmptyState,
  ListSkeleton,
  ProgressBar,
  ProgressRing,
  Skeleton,
} from "@/shared/ui/Display";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import { Dot, PriorityIcon } from "@/shared/ui/WorkIcons";

import { progressOf, targetDateInfo } from "../projectDisplay";
import StarButton from "./StarButton";

export type ProjectsView = "table" | "grid";

interface ProjectsTableProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  view?: ProjectsView;
  onCreate?: () => void;
  /** Shown instead of the "create a project" empty state, e.g. when a search finds nothing. */
  emptyState?: { title: string; description: string; action?: ReactNode };
}

function TargetDate({ project }: { project: Project }) {
  const target = targetDateInfo(project);
  if (!target) return <span className="text-fg-subtle">No target</span>;
  return (
    <span className="flex flex-col">
      <span className={target.late ? "text-[#e5484d]" : "text-fg-muted"}>{target.date}</span>
      {target.hint && (
        <span className={cn("text-[11.5px]", target.late ? "text-[#e5484d]/80" : "text-fg-subtle")}>
          {target.hint}
        </span>
      )}
    </span>
  );
}

function StatusLabel({ project }: { project: Project }) {
  const status = PROJECT_STATUS_META[project.status];
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-muted">
      <Dot color={status.color} />
      {status.label}
    </span>
  );
}

export default function ProjectsTable({
  projects,
  isLoading,
  view = "table",
  onCreate,
  emptyState,
}: ProjectsTableProps) {
  const members = useMemberMap();
  const navigate = useNavigate();

  if (isLoading) {
    return view === "grid" ? (
      <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    ) : (
      <ListSkeleton rows={5} />
    );
  }

  if (!projects?.length) {
    return (
      <EmptyState
        icon={Cube}
        title={emptyState?.title ?? "No projects here"}
        description={
          emptyState?.description ??
          "Projects hold the work items, sprints and progress for one goal."
        }
        action={
          emptyState
            ? emptyState.action
            : onCreate && (
                <button className="text-[12.5px] text-accent hover:underline" onClick={onCreate}>
                  Create a project
                </button>
              )
        }
      />
    );
  }

  const open = (project: Project) => navigate(projectPath(project.key));
  const openOnEnter = (e: KeyboardEvent, project: Project) => {
    if (e.key === "Enter" && e.target === e.currentTarget) open(project);
  };

  if (view === "grid") {
    return (
      <ul className="grid gap-3 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
        {projects.map((project) => {
          const lead = project.leadId ? members.get(project.leadId) : null;
          const share = progressOf(project);
          const target = targetDateInfo(project);
          return (
            <li key={project.id}>
              <div
                role="link"
                tabIndex={0}
                onClick={() => open(project)}
                onKeyDown={(e) => openOnEnter(e, project)}
                className="group flex h-full cursor-pointer flex-col rounded-lg border border-line bg-panel p-4 transition-colors hover:border-line-strong hover:bg-hover/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <div className="flex items-start gap-3">
                  <ProjectIcon color={project.color} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-fg">
                        {project.name}
                      </span>
                      <span className="font-mono text-[11px] text-fg-subtle">{project.key}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 min-h-[2lh] text-[12.5px] text-fg-muted">
                      {project.summary || "No summary yet."}
                    </p>
                  </div>
                  <StarButton project={project} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
                  <StatusLabel project={project} />
                  <span className="inline-flex items-center gap-1 text-fg-muted">
                    <PriorityIcon priority={project.priority} />
                    {PRIORITY_META[project.priority].label}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-fg-subtle tabular-nums">
                    <span>Progress</span>
                    <span>
                      {Math.round(share * 100)}% · {project.counts.done}/{project.counts.total}
                    </span>
                  </div>
                  <ProgressBar value={share} color={project.color} />
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-[12px]">
                  <span className="flex min-w-0 items-center gap-2 text-fg-muted">
                    <Avatar person={lead} size={18} />
                    <span className="truncate">{lead?.name ?? "No lead"}</span>
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1",
                      target?.late ? "text-[#e5484d]" : "text-fg-subtle",
                    )}
                  >
                    <CalendarBlank size={13} />
                    {target ? target.hint || target.date : "No target"}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-[12px] tracking-wide text-fg-subtle uppercase">
            <th className="px-4 py-2 font-medium md:pl-6">Name</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Lead</th>
            <th className="px-3 py-2 font-medium">Target date</th>
            <th className="px-3 py-2 font-medium md:pr-6">Progress</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const lead = project.leadId ? members.get(project.leadId) : null;
            const share = progressOf(project);
            return (
              <tr
                key={project.id}
                onClick={() => open(project)}
                className="group cursor-pointer border-b border-line hover:bg-hover/60"
              >
                <td className="px-4 py-2.5 md:pl-6">
                  <div className="flex items-center gap-2.5">
                    <StarButton project={project} />
                    <ProjectIcon color={project.color} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={projectPath(project.key)}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium text-fg hover:underline"
                        >
                          {project.name}
                        </Link>
                        <span className="font-mono text-[11px] text-fg-subtle">{project.key}</span>
                      </div>
                      {project.summary && (
                        <div className="max-w-[340px] truncate text-xs text-fg-subtle">
                          {project.summary}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusLabel project={project} />
                </td>
                <td className="px-3 py-2.5 text-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <PriorityIcon priority={project.priority} />
                    {PRIORITY_META[project.priority].label}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 text-fg-muted">
                    <Avatar person={lead} size={18} />
                    {lead?.name ?? "–"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <TargetDate project={project} />
                </td>
                <td className="px-3 py-2.5 md:pr-6">
                  <span className="flex items-center gap-2 text-xs text-fg-muted tabular-nums">
                    <ProgressRing value={share} color={project.color} />
                    {Math.round(share * 100)}%
                    <span className="text-fg-subtle">
                      {project.counts.done}/{project.counts.total}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
