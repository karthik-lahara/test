// Demo mode (npm run dev:mock) shows this original screen, unchanged.
// The real-API app uses ProjectsTable.tsx.
import { Link } from "react-router-dom";
import { Cube, Star } from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import { projectPath } from "@/shared/constants/routes";
import { HEALTH_META, PROJECT_STATUS_META } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { formatDate } from "@/shared/lib/format";
import type { Project } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import { Badge, EmptyState, ListSkeleton, ProgressRing } from "@/shared/ui/Display";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import { Dot, PriorityIcon } from "@/shared/ui/WorkIcons";

import { useToggleFavorite } from "../queries/projects.queries";

interface ProjectsTableProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  onCreate?: () => void;
}

export default function ProjectsTable({ projects, isLoading, onCreate }: ProjectsTableProps) {
  const members = useMemberMap();
  const favorite = useToggleFavorite();

  if (isLoading) return <ListSkeleton rows={5} />;
  if (!projects?.length) {
    return (
      <EmptyState
        icon={Cube}
        title="No projects here"
        description="Projects hold the work items, sprints and progress for one goal."
        action={
          onCreate && (
            <button className="text-[12.5px] text-accent hover:underline" onClick={onCreate}>
              Create a project
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-[12px] tracking-wide text-fg-subtle uppercase">
            <th className="px-4 py-2 font-medium md:pl-6">Name</th>
            <th className="px-3 py-2 font-medium">Health</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Lead</th>
            <th className="px-3 py-2 font-medium">Target date</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium md:pr-6">Progress</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const lead = project.leadId ? members.get(project.leadId) : null;
            const share = project.counts.total ? project.counts.done / project.counts.total : 0;
            return (
              <tr key={project.id} className="group border-b border-line hover:bg-hover/60">
                <td className="px-4 py-2.5 md:pl-6">
                  <div className="flex items-center gap-2.5">
                    <button
                      aria-label={project.favorite ? "Remove from favourites" : "Add to favourites"}
                      onClick={() => favorite.mutate(project.id)}
                      className={cn(
                        "text-fg-subtle hover:text-[#d9860b]",
                        !project.favorite && "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <Star
                        size={14}
                        weight={project.favorite ? "fill" : "regular"}
                        className={project.favorite ? "text-[#d9860b]" : ""}
                      />
                    </button>
                    <ProjectIcon color={project.color} />
                    <Link to={projectPath(project.key)} className="min-w-0">
                      <div className="truncate font-medium text-fg hover:underline">
                        {project.name}
                      </div>
                      <div className="truncate text-xs text-fg-subtle">{project.summary}</div>
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge color={HEALTH_META[project.health].color}>
                    {HEALTH_META[project.health].label}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-fg-muted">
                  <PriorityIcon priority={project.priority} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 text-fg-muted">
                    <Avatar person={lead} size={18} />
                    {lead?.name ?? "–"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-fg-muted">
                  {project.endDate ? formatDate(project.endDate, "MMM D, YYYY") : "–"}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-fg-muted">
                    <Dot color={PROJECT_STATUS_META[project.status].color} />
                    {PROJECT_STATUS_META[project.status].label}
                  </span>
                </td>
                <td className="px-3 py-2.5 md:pr-6">
                  <span className="flex items-center gap-2 text-xs text-fg-muted tabular-nums">
                    <ProgressRing value={share} color={HEALTH_META[project.health].color} />
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
