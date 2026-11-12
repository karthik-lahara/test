import { Types } from "mongoose";
import { Pagination } from "@utils/pagination";
import { IOrganizationMember, OrganizationRole } from "./organization-member.entity";

/** "personal" = one person's own projects, "work" = a company or team. Same structure for both. */
export const ORGANIZATION_TYPES = ["personal", "work"] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_STATUSES = ["active", "archived"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/**
 * A document in the organizations collection (a workspace).
 * Who belongs to it, and with which role, is NOT stored here:
 * that lives in the organizationmembers collection.
 */
export interface IOrganization {
  _id: Types.ObjectId;
  name: string;
  type: OrganizationType;
  description?: string;
  createdBy: Types.ObjectId;
  status: OrganizationStatus;
  /** Set when deleted (soft delete). Lets a future cleanup job purge organizations archived N days ago. */
  archivedAt?: Date;
  archivedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Request bodies / params (validated by ajv-schema/) ----

/** Body of POST /api/organizations. createdBy, role and status are set by the server. */
export interface CreateOrganizationInput {
  name: string;
  type: OrganizationType;
  description?: string;
}

/** Body of PATCH /api/organization/update/:organizationId. At least one field. "" description clears it. */
export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
}

/** URL params like /dashboard/:organizationId */
export interface OrganizationParams {
  organizationId: string;
}

// ---- Access check ----

/** Result of the access check: the (active) organization and the user's (active) membership in it */
export interface OrganizationAccess {
  organization: IOrganization;
  membership: IOrganizationMember;
}

// ---- Repository ----

export type CreateOrganizationData = Pick<IOrganization, "name" | "type" | "description" | "createdBy">;
export type CreateOrganizationMemberData = Pick<IOrganizationMember, "organizationId" | "userId" | "role">;

/** One row of the "my organizations" aggregation: a membership with its organization attached */
export type MembershipWithOrganization = Pick<IOrganizationMember, "_id" | "role" | "status" | "joinedAt"> & {
  organization: IOrganization;
};

// ---- Responses (what the client receives) ----

/** An organization as sent to the client: `id` instead of `_id` */
export interface OrganizationResponse {
  id: string;
  name: string;
  type: OrganizationType;
  description?: string;
  status: OrganizationStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The current user's membership in an organization, as sent to the client */
export interface MembershipResponse {
  id: string;
  role: IOrganizationMember["role"];
  status: IOrganizationMember["status"];
  joinedAt: Date;
}

/** An organization together with the current user's membership (role) in it */
export interface UserOrganization {
  organization: OrganizationResponse;
  membership: MembershipResponse;
}

/** data of POST /api/organization/create */
export type CreateOrganizationResult = UserOrganization;

/**
 * Tells the frontend where to send the user after login:
 * NO_ORGANIZATION -> create workspace, SINGLE_ORGANIZATION -> open its dashboard,
 * MULTIPLE_ORGANIZATIONS -> organization selector
 */
export const ONBOARDING_STATUSES = ["NO_ORGANIZATION", "SINGLE_ORGANIZATION", "MULTIPLE_ORGANIZATIONS"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/** data of GET /api/organization/list */
export interface MyOrganizationsResult {
  user: { id: string; fullName: string; email: string };
  onboarding: { status: OnboardingStatus };
  organizations: UserOrganization[];
}

// ---- Organization members list (GET /api/organization/members/:organizationId) ----

/** Query string of the organization members list */
export interface ListOrganizationMembersQuery {
  page?: number;
  limit?: number;
  /** Matches name or email, case-insensitive */
  search?: string;
  role?: OrganizationRole;
}

/** Filters for the organization members aggregation */
export interface ListOrganizationMembersFilter {
  organizationId: Types.ObjectId;
  role?: OrganizationRole;
  search?: string;
  skip: number;
  limit: number;
}

/** One row of the members aggregation: a membership with the user's name and email */
export type OrganizationMemberWithUser = Pick<IOrganizationMember, "_id" | "userId" | "role" | "joinedAt"> & {
  user: { fullName: string; email: string };
};

/** One person in the organization members list */
export interface OrganizationMemberItem {
  userId: string;
  fullName: string;
  email: string;
  role: OrganizationRole;
  joinedAt: Date;
}

/** data of GET /api/organization/members/:organizationId */
export interface ListOrganizationMembersResult {
  members: OrganizationMemberItem[];
  pagination: Pagination;
}
