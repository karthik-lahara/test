import type { QueryClient } from "@tanstack/react-query";

// Query-key roots. Each feature builds its keys from its own root; a mutation that
// changes data owned by another feature invalidates that root.
export const QUERY_ROOTS = {
  auth: "auth",
  users: "users",
  teams: "teams",
  projects: "projects",
  workItems: "work-items",
  sprints: "sprints",
  notifications: "notifications",
  dashboard: "dashboard",
  organization: "organization",
} as const;

type Root = (typeof QUERY_ROOTS)[keyof typeof QUERY_ROOTS];

export function invalidateRoots(queryClient: QueryClient, ...roots: Root[]) {
  return Promise.all(roots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })));
}
