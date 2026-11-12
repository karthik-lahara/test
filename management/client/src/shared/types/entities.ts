// Core records as the API returns them. Several features show the same records
// (a work item row on My work, a board and a sprint), so the shapes live here.

import type {
  Availability,
  Health,
  Priority,
  ProjectStatus,
  Role,
  SprintStatus,
  UserStatus,
  WorkItemStatus,
  WorkItemType,
} from "@/shared/constants/workItem";

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  role: Role;
  status: UserStatus;
  designation: string;
  teamIds: string[];
  reportingManagerId: string | null;
  skills: string[];
  availability: Availability;
  timeZone: string;
  joinedAt: string;
  /** True right after signup, until the user names their organisation. */
  needsOrganization?: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  leadId: string | null;
  memberIds: string[];
}

export interface ProjectCounts {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  overdue: number;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  summary: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  health: Health;
  leadId: string | null;
  memberIds: string[];
  teamId: string | null;
  startDate: string | null;
  endDate: string | null;
  color: string;
  favorite: boolean;
  counts: ProjectCounts;
  createdAt: string;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  done: boolean;
}

export type CreatedVia = "MANUAL" | "AI_TEXT" | "AI_VOICE";

export interface WorkItem {
  id: string;
  key: string;
  projectId: string;
  type: WorkItemType;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  status: WorkItemStatus;
  priority: Priority;
  assigneeIds: string[];
  reporterId: string;
  parentId: string | null;
  sprintId: string | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  loggedHours: number;
  storyPoints: number | null;
  createdVia: CreatedVia;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Filled on detail reads. */
  childCount?: number;
  childDoneCount?: number;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
}

export interface Comment {
  id: string;
  workItemId: string;
  authorId: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface Activity {
  id: string;
  workItemId: string;
  actorId: string;
  text: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  workItemId: string;
  name: string;
  size: number;
  kind: "image" | "document" | "other";
  uploadedBy: string;
  createdAt: string;
}

export type NotificationKind =
  | "ASSIGNED"
  | "REASSIGNED"
  | "STATUS_CHANGED"
  | "DUE_SOON"
  | "OVERDUE"
  | "COMMENT"
  | "MENTION"
  | "MOVED_TO_QA"
  | "SPRINT_STARTED"
  | "SPRINT_COMPLETED"
  | "PROJECT_DEADLINE";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actorId: string | null;
  workItemKey: string | null;
  projectKey: string | null;
  read: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** WORK for a company workspace, PERSONAL for a private one. */
  type?: "WORK" | "PERSONAL";
  description?: string;
  timeZone: string;
  workingDays: number[];
  plan: "FREE" | "TEAM" | "BUSINESS";
  seats: number;
  allowMultipleAssignees: boolean;
  aiEnabled: boolean;
  aiCreditsLeft: number;
}
