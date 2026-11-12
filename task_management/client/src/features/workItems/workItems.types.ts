import type { Priority, WorkItemStatus, WorkItemType } from "@/shared/constants/workItem";

export interface WorkItemFilters {
  projectId?: string;
  /** A member id, "me" or "none". */
  assigneeId?: string;
  status?: string;
  priority?: string;
  type?: string;
  /** A sprint id or "backlog". */
  sprintId?: string;
  parentId?: string;
  search?: string;
  sort?: "priority" | "due" | "order";
  includeSubtasks?: boolean;
}

export interface WorkItemInput {
  projectId: string;
  type: WorkItemType;
  title: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: Priority;
  assigneeIds?: string[];
  parentId?: string | null;
  sprintId?: string | null;
  labels?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  storyPoints?: number | null;
  acceptanceCriteria?: string[];
}
