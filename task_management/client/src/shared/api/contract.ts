// Wire shapes of the API contract ("Lahara Tasks — Database Schema & API Contract") and the
// mappings between them and the client's own records. The client keeps UPPER enum values and
// its own field names; the API speaks lowercase snake_case, `fullName`, `userId`, `fileName`.
//
// Both directions live here so they cannot drift apart: the API files read with `from*`,
// and the demo API in src/mocks (which stands in for the server) writes with `to*`.

import type {
  Availability,
  Priority,
  Role,
  SprintStatus,
  UserStatus,
  WorkItemStatus,
  WorkItemType,
} from "@/shared/constants/workItem";
import type {
  Activity,
  Attachment,
  Comment,
  CreatedVia,
  Member,
  Notification,
  NotificationKind,
  Sprint,
  Team,
  WorkItem,
} from "@/shared/types/entities";

// ---- Enums ----

export type ApiPriority = "urgent" | "high" | "medium" | "low" | "no_priority";
export type ApiWorkItemStatus = "todo" | "in_progress" | "blocked" | "qa" | "done";
export type ApiWorkItemType = "epic" | "feature" | "story" | "task" | "bug" | "subtask";
export type ApiSprintStatus = "planned" | "active" | "completed";
export type ApiOrgRole = "organization_admin" | "member";
export type ApiMemberStatus = "active" | "suspended" | "inactive";
export type ApiAvailability = "available" | "busy" | "on_leave";
export type ApiCreatedVia = "manual" | "ai_text" | "ai_voice";
export type ApiNotificationKind = Lowercase<NotificationKind>;

/** Most enums only change case: IN_PROGRESS <-> in_progress. */
const lower = <T extends string>(value: T) => value.toLowerCase() as Lowercase<T>;
const upper = <T extends string>(value: T) => value.toUpperCase() as Uppercase<T>;

export const toApiPriority = (p: Priority): ApiPriority =>
  p === "NONE" ? "no_priority" : lower(p);
export const fromApiPriority = (p: ApiPriority): Priority =>
  p === "no_priority" ? "NONE" : upper(p);

export const toApiStatus = (s: WorkItemStatus) => lower(s) as ApiWorkItemStatus;
export const fromApiStatus = (s: ApiWorkItemStatus) => upper(s) as WorkItemStatus;

export const toApiType = (t: WorkItemType) => lower(t) as ApiWorkItemType;
export const fromApiType = (t: ApiWorkItemType) => upper(t) as WorkItemType;

/** Organisation roles: project manager is a project role in the contract, not an org role. */
export const toApiRole = (r: Role): ApiOrgRole =>
  r === "ORG_ADMIN" || r === "SUPER_ADMIN" ? "organization_admin" : "member";
export const fromApiRole = (r: ApiOrgRole): Role =>
  r === "organization_admin" ? "ORG_ADMIN" : "MEMBER";

/** INVITED is not a member status in the contract: invitations are their own records. */
export const toApiMemberStatus = (s: UserStatus) =>
  (s === "INVITED" ? "inactive" : lower(s)) as ApiMemberStatus;
export const fromApiMemberStatus = (s: ApiMemberStatus) => upper(s) as UserStatus;

export const toApiAvailability = (a: Availability) => lower(a) as ApiAvailability;
export const fromApiAvailability = (a: ApiAvailability) => upper(a) as Availability;

export const toApiSprintStatus = (s: SprintStatus) => lower(s) as ApiSprintStatus;
export const fromApiSprintStatus = (s: ApiSprintStatus) => upper(s) as SprintStatus;

export const toApiCreatedVia = (v: CreatedVia) => lower(v) as ApiCreatedVia;
export const fromApiCreatedVia = (v: ApiCreatedVia) => upper(v) as CreatedVia;

// ---- Lists ----

export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---- Members and invitations ----

export interface ApiMember {
  userId: string;
  fullName: string;
  email: string;
  role: ApiOrgRole;
  joinedAt: string;
  // Profile fields: the server adds these when the people module lands.
  avatarColor?: string;
  timeZone?: string;
  status?: ApiMemberStatus;
  designation?: string;
  skills?: string[];
  availability?: ApiAvailability;
  reportingManagerId?: string | null;
  teamIds?: string[];
}

export const toApiMember = (m: Member): ApiMember => ({
  userId: m.id,
  fullName: m.name,
  email: m.email,
  avatarColor: m.avatarColor,
  timeZone: m.timeZone,
  role: toApiRole(m.role),
  status: toApiMemberStatus(m.status),
  designation: m.designation,
  skills: m.skills,
  availability: toApiAvailability(m.availability),
  reportingManagerId: m.reportingManagerId,
  teamIds: m.teamIds,
  joinedAt: m.joinedAt,
});

export const fromApiMember = (m: ApiMember): Member => ({
  id: m.userId,
  name: m.fullName,
  email: m.email,
  avatarColor: m.avatarColor ?? "",
  role: fromApiRole(m.role),
  status: m.status ? fromApiMemberStatus(m.status) : "ACTIVE",
  designation: m.designation ?? "",
  teamIds: m.teamIds ?? [],
  reportingManagerId: m.reportingManagerId ?? null,
  skills: m.skills ?? [],
  availability: m.availability ? fromApiAvailability(m.availability) : "AVAILABLE",
  timeZone: m.timeZone ?? "",
  joinedAt: m.joinedAt,
});

export interface ApiInvitation {
  id: string;
  email: string;
  fullName: string;
  role: ApiOrgRole;
  designation: string;
  teamIds: string[];
  reportingManagerId: string | null;
  invitedBy: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
}

/** The People table shows a pending invitation as a member with status INVITED. */
export const fromApiInvitation = (i: ApiInvitation): Member => ({
  id: i.id,
  name: i.fullName,
  email: i.email,
  avatarColor: "",
  role: fromApiRole(i.role),
  status: "INVITED",
  designation: i.designation,
  teamIds: i.teamIds,
  reportingManagerId: i.reportingManagerId,
  skills: [],
  availability: "AVAILABLE",
  timeZone: "",
  joinedAt: i.createdAt,
});

// ---- Teams ----

export interface ApiTeam {
  id: string;
  name: string;
  description: string;
  color: string;
  leadId: string | null;
  memberIds: string[];
  createdAt: string;
}

export const toApiTeam = (t: Team): ApiTeam => ({ ...t, createdAt: "" });
export const fromApiTeam = (t: ApiTeam): Team => ({
  id: t.id,
  name: t.name,
  description: t.description,
  color: t.color,
  leadId: t.leadId,
  memberIds: t.memberIds,
});

// ---- Sprints ----

export interface ApiSprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: ApiSprintStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export const toApiSprint = (s: Sprint): ApiSprint => ({
  ...s,
  status: toApiSprintStatus(s.status),
  startedAt: null,
  completedAt: null,
});

export const fromApiSprint = (s: ApiSprint): Sprint => ({
  id: s.id,
  projectId: s.projectId,
  name: s.name,
  goal: s.goal,
  startDate: s.startDate,
  endDate: s.endDate,
  status: fromApiSprintStatus(s.status),
});

// ---- Work items ----

export interface ApiWorkItem {
  id: string;
  key: string;
  number: number;
  projectId: string;
  type: ApiWorkItemType;
  title: string;
  description: string;
  acceptanceCriteria: Array<{ id: string; text: string; done: boolean }>;
  status: ApiWorkItemStatus;
  priority: ApiPriority;
  assigneeIds: string[];
  reporterId: string;
  parentId: string | null;
  ancestorIds: string[];
  sprintId: string | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  loggedHours: number;
  storyPoints: number | null;
  createdVia: ApiCreatedVia;
  order: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  childCount?: number;
  childDoneCount?: number;
}

export const toApiWorkItem = (w: WorkItem, ancestorIds: string[] = []): ApiWorkItem => ({
  ...w,
  number: Number(w.key.split("-")[1]) || 0,
  type: toApiType(w.type),
  status: toApiStatus(w.status),
  priority: toApiPriority(w.priority),
  createdVia: toApiCreatedVia(w.createdVia),
  ancestorIds,
});

export const fromApiWorkItem = (w: ApiWorkItem): WorkItem => ({
  id: w.id,
  key: w.key,
  projectId: w.projectId,
  type: fromApiType(w.type),
  title: w.title,
  description: w.description,
  acceptanceCriteria: w.acceptanceCriteria,
  status: fromApiStatus(w.status),
  priority: fromApiPriority(w.priority),
  assigneeIds: w.assigneeIds,
  reporterId: w.reporterId,
  parentId: w.parentId,
  sprintId: w.sprintId,
  labels: w.labels,
  startDate: w.startDate,
  dueDate: w.dueDate,
  estimateHours: w.estimateHours,
  loggedHours: w.loggedHours,
  storyPoints: w.storyPoints,
  createdVia: fromApiCreatedVia(w.createdVia),
  order: w.order,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
  completedAt: w.completedAt,
  ...(w.childCount === undefined ? {} : { childCount: w.childCount }),
  ...(w.childDoneCount === undefined ? {} : { childDoneCount: w.childDoneCount }),
});

/** Enum fields of a work item body (create, update, AI fields) that change between the sides. */
const ENUM_FIELDS = {
  type: [toApiType, fromApiType],
  status: [toApiStatus, fromApiStatus],
  priority: [toApiPriority, fromApiPriority],
} as const;

type Body = Record<string, unknown>;

/** A work item body (create or update) as the API takes it. Other fields pass as they are. */
export function toApiWorkItemBody(body: Body): Body {
  const out: Body = { ...body };
  for (const [field, [to]] of Object.entries(ENUM_FIELDS)) {
    if (typeof out[field] === "string") out[field] = (to as (v: string) => string)(out[field]);
  }
  return out;
}

/** The reverse of toApiWorkItemBody, for the demo server reading a request. */
export function fromApiWorkItemBody(body: Body): Body {
  const out: Body = { ...body };
  for (const [field, [, from]] of Object.entries(ENUM_FIELDS)) {
    if (typeof out[field] === "string") out[field] = (from as (v: string) => string)(out[field]);
  }
  return out;
}

export interface ApiTimeLog {
  id: string;
  workItemId: string;
  userId: string;
  hours: number;
  note: string;
  loggedOn: string;
  createdAt: string;
}

// ---- Comments, activity, attachments ----

export interface ApiComment {
  id: string;
  workItemId: string;
  authorId: string;
  body: string;
  parentId: string | null;
  mentionIds: string[];
  editedAt: string | null;
  deleted: boolean;
  createdAt: string;
}

export const toApiComment = (c: Comment, mentionIds: string[] = []): ApiComment => ({
  ...c,
  mentionIds,
  deleted: false,
});

export const fromApiComment = (c: ApiComment): Comment => ({
  id: c.id,
  workItemId: c.workItemId,
  authorId: c.authorId,
  body: c.body,
  parentId: c.parentId,
  createdAt: c.createdAt,
  editedAt: c.editedAt,
});

export interface ApiActivity {
  id: string;
  workItemId: string;
  actorId: string;
  action: string;
  field: string | null;
  from: unknown;
  to: unknown;
  text: string;
  createdAt: string;
}

export const fromApiActivity = (a: ApiActivity): Activity => ({
  id: a.id,
  workItemId: a.workItemId,
  actorId: a.actorId,
  text: a.text,
  createdAt: a.createdAt,
});

export interface ApiAttachment {
  id: string;
  workItemId: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: Attachment["kind"];
  uploadedBy: string;
  createdAt: string;
}

export const toApiAttachment = (
  a: Attachment,
  mimeType = "application/octet-stream",
): ApiAttachment => ({
  id: a.id,
  workItemId: a.workItemId,
  fileName: a.name,
  mimeType,
  size: a.size,
  kind: a.kind,
  uploadedBy: a.uploadedBy,
  createdAt: a.createdAt,
});

export const fromApiAttachment = (a: ApiAttachment): Attachment => ({
  id: a.id,
  workItemId: a.workItemId,
  name: a.fileName,
  size: a.size,
  kind: a.kind,
  uploadedBy: a.uploadedBy,
  createdAt: a.createdAt,
});

// ---- Notifications ----

export interface ApiNotification {
  id: string;
  kind: ApiNotificationKind;
  title: string;
  body: string;
  actorId: string | null;
  workItemId: string | null;
  workItemKey: string | null;
  projectId: string | null;
  projectKey: string | null;
  read: boolean;
  createdAt: string;
}

export const toApiNotification = (
  n: Notification,
  ids: { workItemId?: string | null; projectId?: string | null } = {},
): ApiNotification => ({
  ...n,
  kind: lower(n.kind),
  workItemId: ids.workItemId ?? null,
  projectId: ids.projectId ?? null,
});

export const fromApiNotification = (n: ApiNotification): Notification => ({
  id: n.id,
  kind: upper(n.kind),
  title: n.title,
  body: n.body,
  actorId: n.actorId,
  workItemKey: n.workItemKey,
  projectKey: n.projectKey,
  read: n.read,
  createdAt: n.createdAt,
});
