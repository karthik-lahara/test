import { Types } from "mongoose";
import { OrganizationRole } from "@modules/organization/entities/organization-member.entity";

/** Project-level roles. Separate from organization roles (organization_admin / member). */
export const PROJECT_ROLES = ["project_manager", "member"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Who may do an action on a project: allowed if the user's organization role OR project role is in the list */
interface ProjectPermissionRule {
  organizationRoles: readonly OrganizationRole[];
  projectRoles: readonly ProjectRole[];
}

/**
 * Who may do what on a project. The ONLY place these rules live.
 * Example: to let project managers delete, add "project_manager" to "project:delete" projectRoles.
 */
export const PROJECT_PERMISSIONS = {
  "project:update": { organizationRoles: ["organization_admin"], projectRoles: ["project_manager"] },
  "project:delete": { organizationRoles: ["organization_admin"], projectRoles: [] },
  "project:view_members": { organizationRoles: ["organization_admin"], projectRoles: ["project_manager", "member"] },
  "work_item:create": { organizationRoles: ["organization_admin"], projectRoles: ["project_manager", "member"] },
  "work_item_status:view": { organizationRoles: ["organization_admin"], projectRoles: ["project_manager", "member"] },
  /** Add, rename, recolour, reorder and delete a project's statuses */
  "work_item_status:manage": { organizationRoles: ["organization_admin"], projectRoles: ["project_manager"] },
} as const satisfies Record<string, ProjectPermissionRule>;
export type ProjectPermission = keyof typeof PROJECT_PERMISSIONS;

/** "inactive" = removed from the project; the row is kept for history */
export const PROJECT_MEMBER_STATUSES = ["active", "inactive"] as const;
export type ProjectMemberStatus = (typeof PROJECT_MEMBER_STATUSES)[number];

/**
 * A document in the projectmembers collection: links one user to one project with a role.
 * organizationId is a copy of the project's organization, for fast "my projects in org X"
 * queries and to check that a project belongs to the organization in the URL.
 */
export interface IProjectMember {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  role: ProjectRole;
  status: ProjectMemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Repository ----

export type CreateProjectMemberData = Pick<IProjectMember, "organizationId" | "projectId" | "userId" | "role">;
