import { useQuery } from "@tanstack/react-query";

import { currentOrganizationId } from "@/features/organization";
import { QUERY_ROOTS } from "@/shared/lib/invalidate";
import { request } from "@/shared/lib/request";

export interface DashboardData {
  me: {
    open: number;
    inProgress: number;
    overdue: number;
    dueToday: number;
    completedThisWeek: number;
    loggedHours: number;
    estimatedHours: number;
    stories: number;
    subtasks: number;
  };
  org: {
    employees: number;
    invited: number;
    teams: number;
    activeProjects: number;
    projectManagers: number;
    workload: Array<{ memberId: string; open: number; hours: number }>;
  };
  weekly: Array<{ date: string; completed: number; created: number }>;
}

/** GET /dashboard/:organizationId as the contract sends it: `org` is null for non-admins. */
interface ApiDashboard extends Omit<DashboardData, "org"> {
  org:
    | (Omit<DashboardData["org"], "workload"> & {
        workload: Array<{ userId: string; open: number; hours: number }>;
      })
    | null;
}

const EMPTY_ORG: DashboardData["org"] = {
  employees: 0,
  invited: 0,
  teams: 0,
  activeProjects: 0,
  projectManagers: 0,
  workload: [],
};

async function getDashboardApi(): Promise<DashboardData> {
  const data = await request.get<ApiDashboard>(`/dashboard/${await currentOrganizationId()}`);
  return {
    ...data,
    // Only admins see the organisation block; the page hides it for everyone else.
    org: data.org
      ? {
          ...data.org,
          workload: data.org.workload.map(({ userId, ...w }) => ({ memberId: userId, ...w })),
        }
      : EMPTY_ORG,
  };
}

export const useDashboard = () =>
  useQuery({ queryKey: [QUERY_ROOTS.dashboard], queryFn: getDashboardApi });
