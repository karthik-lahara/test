import { useState } from "react";

import { useSprints } from "@/features/projects";
import {
  applyFilters,
  Board,
  EMPTY_FILTERS,
  FilterBar,
  type FilterValues,
  useCreateWorkItemDialog,
  useWorkItems,
} from "@/features/workItems";
import Select from "@/shared/ui/Select";

import { useProjectContext } from "./projectContext";

export default function ProjectBoardPage() {
  const project = useProjectContext();
  const openCreate = useCreateWorkItemDialog();
  const { data: sprints = [] } = useSprints(project.id);
  const active = sprints.find((s) => s.status === "ACTIVE");
  const [sprintChoice, setSprintChoice] = useState<string | null>(null);
  const sprintId = sprintChoice ?? active?.id ?? "";
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const { data, isLoading } = useWorkItems({
    projectId: project.id,
    sprintId: sprintId || undefined,
    sort: "order",
  });
  const { data: all } = useWorkItems({ projectId: project.id });
  const items = applyFilters(
    data?.filter((w) => w.type !== "EPIC" && w.type !== "FEATURE"),
    filters,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        value={filters}
        onChange={setFilters}
        memberIds={project.memberIds}
        right={
          <div className="w-48">
            <Select
              aria-label="Sprint"
              value={sprintId}
              onChange={(e) => setSprintChoice(e.target.value)}
              options={[
                { value: "", label: "All work items" },
                ...sprints
                  .filter((s) => s.status !== "COMPLETED")
                  .map((s) => ({
                    value: s.id,
                    label: s.status === "ACTIVE" ? `${s.name} (active)` : s.name,
                  })),
                { value: "backlog", label: "Backlog only" },
              ]}
            />
          </div>
        }
      />
      <div className="min-h-0 flex-1">
        <Board
          items={items}
          lookup={all}
          isLoading={isLoading}
          project={project}
          onAdd={(status) =>
            openCreate({
              mode: "manual",
              projectId: project.id,
              status,
              sprintId: sprintId && sprintId !== "backlog" ? sprintId : null,
            })
          }
        />
      </div>
    </div>
  );
}
