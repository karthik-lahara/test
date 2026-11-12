import type { Role } from "@/shared/constants/workItem";

import { useCurrentUser } from "../queries/auth.queries";

const ABILITIES = {
  manageOrganization: ["SUPER_ADMIN", "ORG_ADMIN"],
  manageUsers: ["SUPER_ADMIN", "ORG_ADMIN"],
  manageTeams: ["SUPER_ADMIN", "ORG_ADMIN"],
  createProject: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER"],
  manageSprints: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER"],
  viewOrgDashboard: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER"],
} satisfies Record<string, Role[]>;

export type Ability = keyof typeof ABILITIES;

/** What the signed-in role may use. The UI hides the rest; the API enforces it. */
export function usePermissions() {
  const { data: user } = useCurrentUser();
  return {
    user,
    can: (ability: Ability) => Boolean(user && (ABILITIES[ability] as Role[]).includes(user.role)),
  };
}
