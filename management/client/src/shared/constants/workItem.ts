// Work item vocabulary shared by every screen. The server keeps an identical copy.

export const WORK_ITEM_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "QA", "DONE"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const STATUS_META: Record<WorkItemStatus, { label: string; color: string }> = {
  TODO: { label: "To Do", color: "#8a8f98" },
  IN_PROGRESS: { label: "In Progress", color: "#5e9bff" },
  BLOCKED: { label: "Blocked", color: "#f06a6a" },
  QA: { label: "In QA", color: "#a78bfa" },
  DONE: { label: "Done", color: "#4cc38a" },
};

export const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_META: Record<Priority, { label: string; level: number }> = {
  URGENT: { label: "Urgent", level: 4 },
  HIGH: { label: "High", level: 3 },
  MEDIUM: { label: "Medium", level: 2 },
  LOW: { label: "Low", level: 1 },
  NONE: { label: "No priority", level: 0 },
};

export const WORK_ITEM_TYPES = ["EPIC", "FEATURE", "STORY", "TASK", "SUBTASK", "BUG"] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export const TYPE_META: Record<WorkItemType, { label: string; color: string }> = {
  EPIC: { label: "Epic", color: "#a78bfa" },
  FEATURE: { label: "Feature", color: "#38bdf8" },
  STORY: { label: "User story", color: "#4cc38a" },
  TASK: { label: "Task", color: "#5e9bff" },
  SUBTASK: { label: "Subtask", color: "#94a3b8" },
  BUG: { label: "Bug", color: "#f06a6a" },
};

/**
 * The hierarchy: Epic → Feature → Story → Task / Bug → Subtask.
 * Which types each type may sit under. An empty list means it is always top level.
 * Tasks and bugs may also stand alone; a subtask always needs a parent.
 */
export const PARENT_TYPES: Record<WorkItemType, WorkItemType[]> = {
  EPIC: [],
  FEATURE: ["EPIC"],
  STORY: ["FEATURE"],
  TASK: ["STORY"],
  BUG: ["STORY"],
  SUBTASK: ["TASK", "BUG"],
};

/** The type a new item gets by default when it is added under a parent of this type. */
export const CHILD_TYPE: Record<WorkItemType, WorkItemType | null> = {
  EPIC: "FEATURE",
  FEATURE: "STORY",
  STORY: "TASK",
  TASK: "SUBTASK",
  BUG: "SUBTASK",
  SUBTASK: null,
};

export const canParent = (child: WorkItemType, parent: WorkItemType) =>
  PARENT_TYPES[child].includes(parent);

/**
 * Sprint planning works on stories, bugs and stand-alone tasks. Anything inside one of those
 * (a story's tasks, a task's subtasks) is not planned on its own: it follows its parent into
 * and out of sprints.
 */
export const followsParentSprint = (parentType: WorkItemType | null | undefined) =>
  parentType === "STORY" || parentType === "BUG" || parentType === "TASK";

/** Epics and features span sprints, so they are never planned into one. */
export const isSprintPlannable = (type: WorkItemType, parentType?: WorkItemType | null) =>
  type !== "EPIC" && type !== "FEATURE" && !followsParentSprint(parentType);

/** Story points are estimated on stories and bugs; tasks are estimated in hours. */
export const hasStoryPoints = (type: WorkItemType) => type === "STORY" || type === "BUG";

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  PLANNING: { label: "Planning", color: "#8a8f98" },
  ACTIVE: { label: "Active", color: "#5e9bff" },
  ON_HOLD: { label: "On Hold", color: "#f5a524" },
  COMPLETED: { label: "Completed", color: "#4cc38a" },
  ARCHIVED: { label: "Archived", color: "#52525b" },
};

export const HEALTH = ["ON_TRACK", "AT_RISK", "DELAYED"] as const;
export type Health = (typeof HEALTH)[number];

export const HEALTH_META: Record<Health, { label: string; color: string }> = {
  ON_TRACK: { label: "On track", color: "#4cc38a" },
  AT_RISK: { label: "At risk", color: "#f5a524" },
  DELAYED: { label: "Delayed", color: "#f06a6a" },
};

export const ROLES = ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ORG_ADMIN: "Org Admin",
  PROJECT_MANAGER: "Project Manager",
  MEMBER: "Member",
};

export const USER_STATUSES = ["INVITED", "ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_META: Record<UserStatus, { label: string; color: string }> = {
  INVITED: { label: "Invited", color: "#38bdf8" },
  ACTIVE: { label: "Active", color: "#4cc38a" },
  INACTIVE: { label: "Inactive", color: "#8a8f98" },
  SUSPENDED: { label: "Suspended", color: "#f06a6a" },
};

export const AVAILABILITY = ["AVAILABLE", "BUSY", "ON_LEAVE"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const AVAILABILITY_META: Record<Availability, { label: string; color: string }> = {
  AVAILABLE: { label: "Available", color: "#4cc38a" },
  BUSY: { label: "Busy", color: "#f5a524" },
  ON_LEAVE: { label: "On leave", color: "#8a8f98" },
};

export const SPRINT_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];
