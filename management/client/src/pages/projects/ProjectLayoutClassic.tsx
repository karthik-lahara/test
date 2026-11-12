// Demo mode (npm run dev:mock) shows this original screen, unchanged.
// The real-API app uses ProjectLayout.tsx.
import { Suspense } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  DotsThree,
  Kanban,
  Link as LinkIcon,
  ListChecks,
  Plus,
  Rows,
  SquaresFour,
  Star,
  Timer,
  TreeStructure,
} from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import { useProject, useToggleFavorite } from "@/features/projects";
import { useCreateWorkItemDialog } from "@/features/workItems";
import { projectPath, ROUTES } from "@/shared/constants/routes";
import { toast } from "@/shared/lib/toast";
import Button from "@/shared/ui/Button";
import { EmptyState, Skeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Menu from "@/shared/ui/Menu";
import PageHeader from "@/shared/ui/PageHeader";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import { NavTabs } from "@/shared/ui/Tabs";

export default function ProjectLayout() {
  const { projectKey = "" } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { data: project, isLoading, isError } = useProject(projectKey);
  const favorite = useToggleFavorite();
  const openCreate = useCreateWorkItemDialog();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-6 w-60" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (isError || !project) {
    return (
      <EmptyState
        icon={SquaresFour}
        title="Project not found"
        description="It may have been archived, or you don't have access."
        action={<Button onClick={() => navigate(ROUTES.PROJECTS)}>All projects</Button>}
      />
    );
  }

  const base = projectPath(project.key);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Projects", to: ROUTES.PROJECTS },
          { label: project.name, icon: <ProjectIcon color={project.color} size={13} /> },
        ]}
        description={project.summary || undefined}
        actions={
          <>
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              onClick={() => openCreate({ projectId: project.id })}
            >
              Create
            </Button>
            <IconButton
              icon={Star}
              label={project.favorite ? "Remove from favourites" : "Add to favourites"}
              active={project.favorite}
              className={project.favorite ? "text-[#d9860b]" : ""}
              onClick={() => favorite.mutate(project.id)}
            />
            <IconButton
              icon={LinkIcon}
              label="Copy link"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                toast.success("Link copied");
              }}
            />
            <Menu
              trigger={({ toggle }) => (
                <IconButton icon={DotsThree} label="More" onClick={toggle} />
              )}
              items={[
                {
                  label: "Create",
                  icon: ListChecks,
                  onSelect: () => openCreate({ projectId: project.id }),
                },
                ...(can("createProject")
                  ? [
                      {
                        label: "Archive project",
                        icon: Archive,
                        danger: true,
                        onSelect: () => toast.info("Archive from the project status on Overview."),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        }
      >
        <NavTabs
          items={[
            {
              to: base,
              end: true,
              value: "overview",
              label: "Overview",
              icon: <SquaresFour size={13} />,
            },
            {
              to: `${base}/hierarchy`,
              value: "hierarchy",
              label: "Hierarchy",
              icon: <TreeStructure size={13} />,
            },
            { to: `${base}/board`, value: "board", label: "Board", icon: <Kanban size={13} /> },
            { to: `${base}/list`, value: "list", label: "Work items", icon: <Rows size={13} /> },
            {
              to: `${base}/backlog`,
              value: "backlog",
              label: "Backlog",
              icon: <ListChecks size={13} />,
            },
            {
              to: `${base}/sprints`,
              value: "sprints",
              label: "Sprints",
              icon: <Timer size={13} />,
            },
          ]}
        />
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Suspense fallback={<Skeleton className="m-6 h-80" />}>
          <Outlet context={{ project }} />
        </Suspense>
      </div>
    </>
  );
}
