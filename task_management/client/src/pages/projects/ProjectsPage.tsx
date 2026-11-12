import { useMemo, useState } from "react";
import {
  ArrowsIn,
  ArrowsOut,
  MagnifyingGlass,
  Plus,
  Rows,
  SquaresFour,
  Star,
} from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import {
  CreateProjectModal,
  filterAndSortProjects,
  PROJECT_SORTS,
  type ProjectSort,
  ProjectsTable,
  type ProjectsView,
  STARRED_COLOR,
  useProjects,
} from "@/features/projects";
import { PROJECT_STATUS_META, PROJECT_STATUSES } from "@/shared/constants/workItem";
import { useFullViewPage } from "@/shared/hooks/useFullView";
import Button from "@/shared/ui/Button";
import Input from "@/shared/ui/Input";
import PageHeader from "@/shared/ui/PageHeader";
import Select from "@/shared/ui/Select";
import { Segmented, Tabs } from "@/shared/ui/Tabs";

const VIEW_KEY = "tm.projectsView";
const FULL_VIEW_KEY = "tm.projectsFullView";
/** Tab value for starred projects (not a project status). */
const STARRED = "STARRED";

/** Table or cards, remembered per browser. */
function useProjectsView() {
  const [view, setView] = useState<ProjectsView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "table";
    } catch {
      return "table";
    }
  });
  const change = (next: ProjectsView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage blocked: the choice lasts until reload */
    }
  };
  return [view, change] as const;
}

export default function ProjectsPage() {
  const { can } = usePermissions();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [view, setView] = useProjectsView();
  const [creating, setCreating] = useState(false);
  const { fullView, toggle: toggleFullView } = useFullViewPage(FULL_VIEW_KEY);
  const { data: open, isLoading } = useProjects();
  const { data: archived } = useProjects("ARCHIVED");

  const starred = open?.filter((p) => p.favorite);
  const inTab =
    status === STARRED
      ? starred
      : status === "ARCHIVED"
        ? archived
        : open?.filter((p) => !status || p.status === status);
  const projects = useMemo(
    () => inTab && filterAndSortProjects(inTab, search, sort),
    [inTab, search, sort],
  );
  const searching = search.trim() !== "";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projects" }]}
        description="Every project in the organisation, with progress at a glance."
        actions={
          <>
            <Button
              variant="ghost"
              icon={fullView ? ArrowsIn : ArrowsOut}
              onClick={toggleFullView}
              aria-pressed={fullView}
              title={
                fullView ? "Exit full view (Esc)" : "Hide the sidebar and use the whole window"
              }
            >
              {fullView ? "Exit full view" : "Full view"}
            </Button>
            {can("createProject") && (
              <Button variant="secondary" icon={Plus} onClick={() => setCreating(true)}>
                New project
              </Button>
            )}
          </>
        }
      >
        <Tabs
          variant="underline"
          value={status}
          onChange={setStatus}
          items={[
            { value: "", label: "All", count: open?.length },
            {
              value: STARRED,
              label: "Starred",
              icon: (
                <Star
                  size={13}
                  weight={status === STARRED ? "fill" : "regular"}
                  style={{ color: STARRED_COLOR }}
                />
              ),
              count: starred?.length,
            },
            ...PROJECT_STATUSES.map((s) => ({
              value: s,
              label: PROJECT_STATUS_META[s].label,
              count:
                s === "ARCHIVED" ? archived?.length : open?.filter((p) => p.status === s).length,
            })),
          ]}
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
        <div className="w-full sm:w-64">
          <Input
            icon={MagnifyingGlass}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, key or summary"
            aria-label="Search projects"
          />
        </div>
        <div className="w-44">
          <Select
            aria-label="Sort projects"
            value={sort}
            onChange={(e) => setSort(e.target.value as ProjectSort)}
            options={PROJECT_SORTS.map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {projects && (
            <span className="text-xs text-fg-subtle tabular-nums">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          )}
          <Segmented
            value={view}
            onChange={(v) => setView(v as ProjectsView)}
            items={[
              { value: "table", label: "Table", icon: <Rows size={13} /> },
              { value: "grid", label: "Cards", icon: <SquaresFour size={13} /> },
            ]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ProjectsTable
          projects={projects}
          isLoading={isLoading}
          view={view}
          onCreate={can("createProject") ? () => setCreating(true) : undefined}
          emptyState={
            searching
              ? {
                  title: "No projects match your search",
                  description: `Nothing in this tab matches "${search.trim()}".`,
                  action: (
                    <button
                      className="text-[12.5px] text-accent hover:underline"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </button>
                  ),
                }
              : status === STARRED
                ? {
                    title: "No starred projects yet",
                    description:
                      "Star a project with the ☆ next to its name to keep it here and at the top of the sidebar.",
                    action: (
                      <button
                        className="text-[12.5px] text-accent hover:underline"
                        onClick={() => setStatus("")}
                      >
                        Show all projects
                      </button>
                    ),
                  }
                : undefined
          }
        />
      </div>
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
