import { usePermissions } from "@/features/auth";
import { ProjectOverview, ProjectOverviewClassic } from "@/features/projects";
import { env } from "@/shared/config/env";

import { useProjectContext } from "./projectContext";

// Demo mode (npm run dev:mock) keeps the original overview
const Overview = env.USE_MOCKS ? ProjectOverviewClassic : ProjectOverview;

export default function ProjectOverviewPage() {
  const project = useProjectContext();
  const { user, can } = usePermissions();
  const canEdit = can("createProject") || project.leadId === user?.id;
  return <Overview key={project.id} project={project} canEdit={canEdit} />;
}
