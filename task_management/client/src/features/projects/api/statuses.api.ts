import { request } from "@/shared/lib/request";

// Shapes of server/src/modules/work-item-status (GET/POST /work-item-statuses/...)

/** Fixed groups every status belongs to; the rules (done, progress) use these, not names. */
export const STATUS_CATEGORIES = ["todo", "in_progress", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_META: Record<StatusCategory, { label: string; hint: string }> = {
  todo: { label: "To do", hint: "Not started" },
  in_progress: { label: "In progress", hint: "Being worked on" },
  done: { label: "Done", hint: "Finished: sets the completed date" },
};

/** One of a project's own statuses (To Do, In Progress, ... and custom ones). */
export interface ProjectStatus {
  id: string;
  projectId: string;
  name: string;
  category: StatusCategory;
  color: string;
  /** Board column order */
  order: number;
  /** New work items start here */
  isDefault: boolean;
  /** Work items currently in this status */
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StatusInput {
  name: string;
  category: StatusCategory;
  color: string;
}

export const listStatusesApi = (projectId: string) =>
  request.get<ProjectStatus[]>(`/work-item-statuses/${projectId}`);

export const createStatusApi = (projectId: string, input: StatusInput & { isDefault?: boolean }) =>
  request.post<ProjectStatus>(`/work-item-statuses/${projectId}`, input);

/** Send only what changes. isDefault only accepts true (make another status the default instead). */
export const updateStatusApi = (
  statusId: string,
  patch: Partial<StatusInput> & { isDefault?: true },
) => request.patch<ProjectStatus>(`/work-item-statuses/update/${statusId}`, patch);

/** statusIds: every status of the project, once, in the new order. */
export const reorderStatusesApi = (projectId: string, statusIds: string[]) =>
  request.post<ProjectStatus[]>(`/work-item-statuses/reorder/${projectId}`, { statusIds });

/** moveToStatusId is required when the status still has work items. */
export const deleteStatusApi = (statusId: string, moveToStatusId?: string) =>
  request.delete<null>(`/work-item-statuses/delete/${statusId}`, {
    params: moveToStatusId ? { moveToStatusId } : undefined,
  });
