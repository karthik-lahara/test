import { Types } from "mongoose";
import { Pagination } from "@utils/pagination";
import { IOrganizationMember, OrganizationRole } from "@modules/organization/entities/organization-member.entity";
import { IProjectMember, ProjectRole } from "./project-member.entity";

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ["no_priority", "low", "medium", "high", "urgent"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const PROJECT_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9]{1,5}$";
export const PROJECT_COLOR_PATTERN = "^#[0-9A-Fa-f]{6}$";
export const MAX_INITIAL_MEMBERS = 50;


export interface IProject {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  key: string;
  summary?: string;
  description?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  leadId: Types.ObjectId;
  startDate?: Date;
  targetDate?: Date;
  color?: string;
  createdBy: Types.ObjectId;
  isArchived: boolean;
  archivedAt?: Date;
  archivedBy?: Types.ObjectId;
  /** Number of the last work item made in this project (keys are KEY-1, KEY-2...) */
  workItemCounter: number;
  createdAt: Date;
  updatedAt: Date;
}


export interface CreateProjectInput {
  name: string;
  key: string;
  summary?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  /** Defaults to the creator */
  leadId?: string;
  /** "YYYY-MM-DD" */
  startDate?: string;
  targetDate?: string;
  /** Added to the project as "member" */
  memberIds?: string[];
  color?: string;
}

/**
 * Body of PATCH /api/projects/update/:projectId. Send only what changes (at least one field).
 * "" clears summary/description; null clears startDate/targetDate/color.
 * key, lead, members, organizationId and archive fields cannot be changed here.
 */
export interface UpdateProjectInput {
  name?: string;
  summary?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  startDate?: string | null;
  targetDate?: string | null;
  color?: string | null;
}

export interface ProjectParams {
  projectId: string;
}

/** Result of the project access check */
export interface ProjectAccess {
  project: IProject;
  organizationMembership: IOrganizationMember;
  /** null when the user is not in the project (e.g. an admin) */
  projectMembership: IProjectMember | null;
}

// Pagination rules are shared by every list endpoint (utils/pagination.ts)
export { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "@utils/pagination";

export interface ListProjectsQuery {
  page?: number;
  limit?: number;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  /** Matches name or key, case-insensitive */
  search?: string;
}


export type CreateProjectData = Pick<
  IProject,
  | "organizationId"
  | "name"
  | "key"
  | "summary"
  | "description"
  | "status"
  | "priority"
  | "leadId"
  | "startDate"
  | "targetDate"
  | "color"
  | "createdBy"
>;

/** Fields the update may set */
export type UpdateProjectFields = Partial<
  Pick<IProject, "name" | "summary" | "description" | "status" | "priority" | "startDate" | "targetDate" | "color">
>;

/** Optional fields the update may remove */
export type RemovableProjectField = "summary" | "description" | "startDate" | "targetDate" | "color";

/** What an update changes: new values to save, and optional fields to remove */
export interface ProjectChanges {
  fieldsToSet: UpdateProjectFields;
  fieldsToRemove: RemovableProjectField[];
}

export interface ListProjectsFilter {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  projectIds?: Types.ObjectId[];
  status?: ProjectStatus;
  priority?: ProjectPriority;
  search?: string;
  skip: number;
  limit: number;
}

export type ProjectListRow = Omit<IProject, "description"> & {
  lead?: { _id: Types.ObjectId; fullName: string };
  memberCount: number;
  myMembership?: { role: ProjectRole };
};

export type ProjectMemberWithUser = Pick<IProjectMember, "_id" | "userId" | "role" | "joinedAt"> & {
  user: { fullName: string; email: string };
};


export interface ProjectResponse {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  summary?: string;
  description?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  leadId: string;
  startDate?: Date;
  targetDate?: Date;
  color?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemberResponse {
  id: string;
  userId: string;
  role: IProjectMember["role"];
  status: IProjectMember["status"];
  joinedAt: Date;
}

export interface CreateProjectResult {
  project: ProjectResponse;
  members: ProjectMemberResponse[];
}

export interface UserSummary {
  id: string;
  fullName: string;
  email?: string;
}

export type ProjectListItem = Omit<ProjectResponse, "description"> & {
  lead: UserSummary | null;
  memberCount: number;
  myRole: ProjectRole | null;
};

export interface ListProjectsResult {
  projects: ProjectListItem[];
  pagination: Pagination;
}

export interface ProjectMemberDetails {
  userId: string;
  fullName: string;
  email: string;
  role: ProjectRole;
  joinedAt: Date;
}

export interface ProjectDetailsResult {
  project: ProjectResponse & { lead: UserSummary | null };
  members: ProjectMemberDetails[];
  access: { organizationRole: OrganizationRole; projectRole: ProjectRole | null };
}

// ---- Project members list (GET /api/projects/members/:projectId) ----

/** Query string of the project members list */
export interface ListProjectMembersQuery {
  page?: number;
  limit?: number;
  /** Matches name or email, case-insensitive */
  search?: string;
  role?: ProjectRole;
}

/** Filters for the project members aggregation */
export interface ListProjectMembersFilter {
  projectId: Types.ObjectId;
  role?: ProjectRole;
  search?: string;
  skip: number;
  limit: number;
}

/** data of GET /api/projects/members/:projectId */
export interface ListProjectMembersResult {
  members: ProjectMemberDetails[];
  pagination: Pagination;
}
