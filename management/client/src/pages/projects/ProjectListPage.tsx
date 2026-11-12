import { useState } from "react";

import {
  applyFilters,
  EMPTY_FILTERS,
  FilterBar,
  type FilterValues,
  useCreateWorkItemDialog,
  useWorkItems,
  WorkItemList,
} from "@/features/workItems";

import { useProjectContext } from "./projectContext";

export default function ProjectListPage() {
  const project = useProjectContext();
  const openCreate = useCreateWorkItemDialog();
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const { data, isLoading } = useWorkItems({ projectId: project.id });

  return (
    <>
      <FilterBar value={filters} onChange={setFilters} memberIds={project.memberIds} />
      <WorkItemList
        items={applyFilters(data, filters)}
        isLoading={isLoading}
        projects={new Map([[project.id, project]])}
        onAdd={(status) => openCreate({ mode: "manual", projectId: project.id, status })}
      />
    </>
  );
}
