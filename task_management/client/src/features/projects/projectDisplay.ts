import { PRIORITY_META } from "@/shared/constants/workItem";
import { daysUntil, formatDate } from "@/shared/lib/format";
import type { Project } from "@/shared/types/entities";

export const PROJECT_SORTS = [
  { value: "recent", label: "Recently created" },
  { value: "name", label: "Name" },
  { value: "target", label: "Target date" },
  { value: "priority", label: "Priority" },
] as const;

export type ProjectSort = (typeof PROJECT_SORTS)[number]["value"];

/** Projects whose name, key or summary contains the text, in the chosen order. */
export function filterAndSortProjects(
  projects: Project[],
  search: string,
  sort: ProjectSort,
): Project[] {
  const text = search.trim().toLowerCase();
  const matches = text
    ? projects.filter((p) =>
        [p.name, p.key, p.summary].some((field) => field.toLowerCase().includes(text)),
      )
    : [...projects];

  return matches.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "target":
        // Projects without a target date go last
        return (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999");
      case "priority":
        return PRIORITY_META[b.priority].level - PRIORITY_META[a.priority].level;
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
}

export const progressOf = (project: Project) =>
  project.counts.total ? project.counts.done / project.counts.total : 0;

/** "Mar 4, 2026" plus "in 5 days" / "3 days late", or null when there is no target date. */
export function targetDateInfo(project: Project) {
  if (!project.endDate) return null;
  const days = daysUntil(project.endDate);
  const finished = project.status === "COMPLETED" || project.status === "ARCHIVED";
  let hint = "";
  if (!finished) {
    if (days < 0) hint = `${-days} day${days === -1 ? "" : "s"} late`;
    else if (days === 0) hint = "due today";
    else if (days <= 30) hint = `in ${days} day${days === 1 ? "" : "s"}`;
  }
  return {
    date: formatDate(project.endDate, "MMM D, YYYY"),
    hint,
    late: !finished && days < 0,
  };
}
