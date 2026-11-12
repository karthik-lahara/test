// Demo mode (npm run dev:mock) shows this original screen, unchanged.
// The real-API app uses ProjectsPage.tsx.
import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import {
  CreateProjectModal,
  ProjectsTableClassic as ProjectsTable,
  useProjects,
} from "@/features/projects";
import { PROJECT_STATUS_META, PROJECT_STATUSES } from "@/shared/constants/workItem";
import Button from "@/shared/ui/Button";
import PageHeader from "@/shared/ui/PageHeader";
import { Tabs } from "@/shared/ui/Tabs";

export default function ProjectsPage() {
  const { can } = usePermissions();
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: open, isLoading } = useProjects();
  const { data: archived } = useProjects("ARCHIVED");

  const projects =
    status === "ARCHIVED" ? archived : open?.filter((p) => !status || p.status === status);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projects" }]}
        description="Every project in the organisation, with health and progress at a glance."
        actions={
          can("createProject") && (
            <Button variant="secondary" icon={Plus} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      >
        <Tabs
          variant="underline"
          value={status}
          onChange={setStatus}
          items={[
            { value: "", label: "All", count: open?.length },
            ...PROJECT_STATUSES.map((s) => ({
              value: s,
              label: PROJECT_STATUS_META[s].label,
              count:
                s === "ARCHIVED" ? archived?.length : open?.filter((p) => p.status === s).length,
            })),
          ]}
        />
      </PageHeader>
      <div className="flex-1 overflow-y-auto">
        <ProjectsTable
          projects={projects}
          isLoading={isLoading}
          onCreate={can("createProject") ? () => setCreating(true) : undefined}
        />
      </div>
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
