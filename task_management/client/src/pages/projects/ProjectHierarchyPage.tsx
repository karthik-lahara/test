import { HierarchyTree, useWorkItems } from "@/features/workItems";

import { useProjectContext } from "./projectContext";

export default function ProjectHierarchyPage() {
  const project = useProjectContext();
  const { data, isLoading } = useWorkItems({ projectId: project.id, includeSubtasks: true });
  return <HierarchyTree items={data} isLoading={isLoading} project={project} />;
}
