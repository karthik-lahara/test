import { Types } from "mongoose";
import { StatusCategory, StatusSummary } from "@modules/work-item-status/entities/work-item-status.entity";

// Values are lowercase like the project module; the client maps them to its own (TASK, HIGH...).
// Statuses are per project (work-item-status module); an item stores the status id.

export const WORK_ITEM_TYPES = ["epic", "feature", "story", "task", "bug", "subtask"] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

/** Same values as project priorities */
export const WORK_ITEM_PRIORITIES = ["no_priority", "low", "medium", "high", "urgent"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

/** How the item was entered: the manual form, a typed description, or speech */
export const WORK_ITEM_CREATED_VIA = ["manual", "text", "voice"] as const;
export type WorkItemCreatedVia = (typeof WORK_ITEM_CREATED_VIA)[number];

/**
 * The hierarchy: Epic → Feature → Story → Task / Bug → Subtask.
 * Which types each type may sit under (an epic is top level). Same rules as the client.
 */
export const PARENT_TYPES: Record<WorkItemType, readonly WorkItemType[]> = {
  epic: [],
  feature: ["epic"],
  story: ["feature"],
  task: ["story"],
  bug: ["story"],
  subtask: ["task", "bug"],
};

/** Story points are estimated on stories and bugs; other types are estimated in hours */
export const STORY_POINT_TYPES: readonly WorkItemType[] = ["story", "bug"];

export const TYPE_LABELS: Record<WorkItemType, string> = {
  epic: "epic",
  feature: "feature",
  story: "story",
  task: "task",
  bug: "bug",
  subtask: "subtask",
};

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_ASSIGNEES = 10;
export const MAX_LABELS = 20;
export const MAX_LABEL_LENGTH = 30;
export const MAX_ACCEPTANCE_CRITERIA = 20;
export const MAX_CRITERION_LENGTH = 300;
export const MAX_ESTIMATE_HOURS = 1000;
export const MAX_STORY_POINTS = 100;

/** Gap between neighbours in `order`, so an item can be dropped between two without renumbering */
export const ORDER_STEP = 1000;

export interface IAcceptanceCriterion {
  _id: Types.ObjectId;
  text: string;
  done: boolean;
}

/** A file attached to a work item (added by the upload endpoint, not on create) */
export interface IWorkItemAttachment {
  _id: Types.ObjectId;
  fileName: string;
  fileUrl: string;
}

/** A document in the workitems collection */
export interface IWorkItem {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  /** Per-project running number: PAY-12 has number 12 */
  number: number;
  /** Project key + number, e.g. "PAY-12". Never changes. */
  key: string;
  type: WorkItemType;
  title: string;
  description?: string;
  acceptanceCriteria: IAcceptanceCriterion[];
  /** One of the project's statuses (workitemstatuses) */
  statusId: Types.ObjectId;
  /**
   * Copy of the status's category, kept in step by the status module, so "done" and
   * "in progress" counts don't need to look up the status
   */
  statusCategory: StatusCategory;
  priority: WorkItemPriority;
  assigneeIds: Types.ObjectId[];
  /** Who created it */
  reporterId: Types.ObjectId;
  parentId?: Types.ObjectId;
  sprintId?: Types.ObjectId;
  labels: string[];
  startDate?: Date;
  dueDate?: Date;
  estimateHours?: number;
  /** Sum of logged time; changed by time logs, not on create */
  loggedHours: number;
  storyPoints?: number;
  createdVia: WorkItemCreatedVia;
  /** true when the fields came from an AI suggestion the user approved */
  aiGenerated: boolean;
  attachments: IWorkItemAttachment[];
  /** Position in the backlog and board (steps of ORDER_STEP); new items go last */
  order: number;
  completedAt?: Date;
  /** Who created it */
  createdBy: Types.ObjectId;
  /** Soft delete: archived items are hidden and cannot be used as parents */
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Requests ----

/** Body of POST /api/work-items */
export interface CreateWorkItemInput {
  /** Required; the project must belong to this organization */
  organizationId: string;
  /** Required */
  projectId: string;
  type: WorkItemType;
  title: string;
  description?: string;
  /** One of the project's statuses; defaults to the project's default status */
  statusId?: string | null;
  priority?: WorkItemPriority;
  assigneeIds?: string[];
  /** The epic, feature, story, task or bug this goes under (same project) */
  parentId?: string | null;
  sprintId?: string | null;
  labels?: string[];
  /** "YYYY-MM-DD" */
  startDate?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  /** Only for stories and bugs */
  storyPoints?: number | null;
  acceptanceCriteria?: string[];
  createdVia?: WorkItemCreatedVia;
  aiGenerated?: boolean;
}

// ---- Repository ----

/** loggedHours, attachments and isArchived start at their defaults */
export type CreateWorkItemData = Omit<
  IWorkItem,
  "_id" | "acceptanceCriteria" | "loggedHours" | "attachments" | "isArchived" | "createdAt" | "updatedAt"
> & {
  acceptanceCriteria: Array<{ text: string; done: boolean }>;
};

/** The parent fields the create check needs (only non-archived items are returned) */
export type WorkItemParent = Pick<IWorkItem, "_id" | "projectId" | "type" | "key" | "sprintId">;

/** Epics and features span sprints, so they are never planned into one */
export const NOT_IN_SPRINT_TYPES: readonly WorkItemType[] = ["epic", "feature"];

/** Items under these follow their parent into and out of sprints (a story's tasks, a task's subtasks) */
export const SPRINT_FOLLOWING_PARENT_TYPES: readonly WorkItemType[] = ["story", "bug", "task"];

// ---- Responses ----

export interface WorkItemResponse {
  id: string;
  organizationId: string;
  projectId: string;
  key: string;
  type: WorkItemType;
  title: string;
  description: string;
  acceptanceCriteria: Array<{ id: string; text: string; done: boolean }>;
  statusId: string;
  /** The status's name, category and colour, so the client needs no second call */
  status: StatusSummary;
  priority: WorkItemPriority;
  assigneeIds: string[];
  reporterId: string;
  parentId: string | null;
  sprintId: string | null;
  labels: string[];
  startDate: Date | null;
  dueDate: Date | null;
  estimateHours: number | null;
  loggedHours: number;
  storyPoints: number | null;
  createdVia: WorkItemCreatedVia;
  aiGenerated: boolean;
  attachments: Array<{ id: string; fileName: string; fileUrl: string }>;
  order: number;
  completedAt: Date | null;
  createdBy: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}
