import { useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";

import { useProjects } from "@/features/projects";
import {
  applyFilters,
  EMPTY_FILTERS,
  FilterBar,
  type FilterValues,
  useCreateWorkItemDialog,
  useWorkItems,
  WorkItemList,
} from "@/features/workItems";
import AiAgent from "@/shared/ui/AiAgent";
import Button from "@/shared/ui/Button";
import PageHeader from "@/shared/ui/PageHeader";
import { Tabs } from "@/shared/ui/Tabs";

export default function MyWorkPage() {
  const [tab, setTab] = useState("assigned");
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const openCreate = useCreateWorkItemDialog();
  const { data: projects = [] } = useProjects();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const { data, isLoading } = useWorkItems({ assigneeId: "me", includeSubtasks: true });

  const items = applyFilters(
    data?.filter((w) => (tab === "done" ? w.status === "DONE" : w.status !== "DONE")),
    filters,
  );

  // Open tab, no filters, and nothing left open: celebrate quietly.
  const allClear =
    tab === "assigned" &&
    !!data &&
    data.every((w) => w.status === "DONE") &&
    JSON.stringify(filters) === JSON.stringify(EMPTY_FILTERS);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My work" }]}
        description="Everything assigned to you, across all projects."
        actions={
          <Button variant="secondary" icon={Plus} onClick={() => openCreate({ mode: "manual" })}>
            Create
          </Button>
        }
      >
        <Tabs
          variant="underline"
          value={tab}
          onChange={setTab}
          items={[
            {
              value: "assigned",
              label: "Open",
              count: data?.filter((w) => w.status !== "DONE").length,
            },
            {
              value: "done",
              label: "Completed",
              count: data?.filter((w) => w.status === "DONE").length,
            },
          ]}
        />
      </PageHeader>
      <FilterBar value={filters} onChange={setFilters} hideAssignee />
      <div className="flex-1 overflow-y-auto">
        <WorkItemList
          items={items}
          isLoading={isLoading}
          projects={projectMap}
          showProject
          {...(allClear
            ? {
                emptyTitle: "You're all caught up",
                emptyDescription:
                  "Nothing open is assigned to you. Pick up something from a backlog, or create a task.",
                emptyArt: (
                  <div className="mb-5">
                    <AiAgent state="done" size={56} />
                  </div>
                ),
              }
            : { emptyTitle: "Nothing assigned to you" })}
          onAdd={(status) => openCreate({ mode: "manual", status })}
        />
      </div>
    </>
  );
}
