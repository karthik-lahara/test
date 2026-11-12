import { Types } from "mongoose";

export const ORGANIZATION_ROLES = ["organization_admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/**
 * Who may do what inside an organization. The ONLY place these rules live.
 * To allow another role later, add it to the list, e.g. "project:create": ["organization_admin", "member"].
 */
export const ORGANIZATION_PERMISSIONS = {
  "organization:update": ["organization_admin"],
  "organization:delete": ["organization_admin"],
  "project:create": ["organization_admin"],
  /** See and open every project of the organization without being a project member */
  "project:view_all": ["organization_admin"],
} as const satisfies Record<string, readonly OrganizationRole[]>;
export type OrganizationPermission = keyof typeof ORGANIZATION_PERMISSIONS;

/** "inactive" = removed from the organization; the row is kept for history */
export const ORGANIZATION_MEMBER_STATUSES = ["active", "inactive"] as const;
export type OrganizationMemberStatus = (typeof ORGANIZATION_MEMBER_STATUSES)[number];

/**
 * A document in the organizationmembers collection: links one user to one organization with a role.
 * A user has one of these per organization they belong to, so roles can differ per organization.
 */
export interface IOrganizationMember {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
