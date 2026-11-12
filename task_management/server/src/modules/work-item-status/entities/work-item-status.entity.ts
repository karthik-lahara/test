import { Types } from "mongoose";

/**
 * Every status belongs to one fixed category. Names are free ("Code review", "Shipped"), but
 * all rules (completedAt, progress, sprint completion) look at the category, never the name.
 */
export const STATUS_CATEGORIES = ["todo", "in_progress", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_COLOR_PATTERN = "^#[0-9A-Fa-f]{6}$";
export const MAX_STATUS_NAME_LENGTH = 30;
export const MAX_STATUSES_PER_PROJECT = 20;
/** Gap between neighbours in `order` (board column order) */
export const STATUS_ORDER_STEP = 1000;

/** Every project starts with these; the first one is the default for new items */
export const DEFAULT_STATUSES: ReadonlyArray<{ name: string; category: StatusCategory; color: string }> = [
  { name: "To Do", category: "todo", color: "#8A8F98" },
  { name: "In Progress", category: "in_progress", color: "#5E9BFF" },
  { name: "Blocked", category: "in_progress", color: "#F06A6A" },
  { name: "In QA", category: "in_progress", color: "#A78BFA" },
  { name: "Done", category: "done", color: "#4CC38A" },
];

/** A document in the workitemstatuses collection: one status of one project */
export interface IWorkItemStatus {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  /** Lowercase name, for "one name per project" without caring about capitals */
  nameKey: string;
  category: StatusCategory;
  color: string;
  /** Board column order */
  order: number;
  /** New items start here. Exactly one per project. */
  isDefault: boolean;
  /** Deleted statuses are kept (archived) so old history still has a name to show */
  isArchived: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Requests ----

/** Body of POST /api/work-item-statuses/:projectId */
export interface CreateStatusInput {
  name: string;
  category: StatusCategory;
  color?: string;
  isDefault?: boolean;
}

/** Body of PATCH /api/work-item-statuses/update/:statusId. Send only what changes. */
export interface UpdateStatusInput {
  name?: string;
  category?: StatusCategory;
  color?: string;
  /** Only true is accepted: to change the default, make another status the default */
  isDefault?: true;
}

/** Body of POST /api/work-item-statuses/reorder/:projectId: every active status id, in the new order */
export interface ReorderStatusesInput {
  statusIds: string[];
}

/** Query of DELETE /api/work-item-statuses/delete/:statusId */
export interface DeleteStatusQuery {
  /** Where the status's work items go. Required when it still has items. */
  moveToStatusId?: string;
}

export interface StatusParams {
  statusId: string;
}

// ---- Repository ----

export type CreateStatusData = Pick<
  IWorkItemStatus,
  "organizationId" | "projectId" | "name" | "nameKey" | "category" | "color" | "order" | "isDefault" | "createdBy"
>;

export type UpdateStatusFields = Partial<Pick<IWorkItemStatus, "name" | "nameKey" | "category" | "color" | "isDefault">>;

// ---- Responses ----

/** The short form embedded in every work item response */
export interface StatusSummary {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
}

export interface StatusResponse extends StatusSummary {
  projectId: string;
  order: number;
  isDefault: boolean;
  /** Active work items in this status (for "move N items" when deleting) */
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}
