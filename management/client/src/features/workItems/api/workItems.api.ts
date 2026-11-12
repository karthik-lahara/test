import { currentOrganizationId } from "@/features/organization";
import {
  type ApiActivity,
  type ApiAttachment,
  type ApiComment,
  type ApiTimeLog,
  type ApiWorkItem,
  fromApiActivity,
  fromApiAttachment,
  fromApiComment,
  fromApiWorkItem,
  toApiPriority,
  toApiStatus,
  toApiType,
  toApiWorkItemBody,
} from "@/shared/api/contract";
import { fetchAllPages } from "@/shared/api/pages";
import type { Priority, WorkItemStatus, WorkItemType } from "@/shared/constants/workItem";
import { request } from "@/shared/lib/request";
import type { Activity, Attachment, Comment, WorkItem } from "@/shared/types/entities";

import type { WorkItemFilters, WorkItemInput } from "../workItems.types";

// Paths and shapes of the API contract: /work-items, /comments, /activity, /attachments.

/** "TODO,DONE" -> "todo,done": filter lists use the API's enum values. */
const mapList = <T extends string>(value: string | undefined, to: (v: T) => string) =>
  value
    ? value
        .split(",")
        .map((v) => to(v as T))
        .join(",")
    : undefined;

export async function listWorkItemsApi(filters: WorkItemFilters): Promise<WorkItem[]> {
  const organizationId = await currentOrganizationId();
  const params = {
    ...filters,
    status: mapList<WorkItemStatus>(filters.status, toApiStatus),
    priority: mapList<Priority>(filters.priority, toApiPriority),
    type: mapList<WorkItemType>(filters.type, toApiType),
  };
  const items = await fetchAllPages<ApiWorkItem>(
    `/work-items/list/${organizationId}`,
    "workItems",
    params,
  );
  return items.map(fromApiWorkItem);
}

const isItemKey = (value: string) => /^[A-Za-z][A-Za-z0-9]{1,5}-\d+$/.test(value);

/** Item pages use the key in the URL (/items/PAY-12); other callers pass the id. */
export async function getWorkItemApi(idOrKey: string): Promise<WorkItem> {
  const path = isItemKey(idOrKey)
    ? `/work-items/by-key/${await currentOrganizationId()}/${idOrKey.toUpperCase()}`
    : `/work-items/details/${idOrKey}`;
  return fromApiWorkItem(await request.get<ApiWorkItem>(path));
}

export async function createWorkItemApi({ projectId, ...input }: WorkItemInput): Promise<WorkItem> {
  const item = await request.post<ApiWorkItem>(
    `/work-items/${projectId}`,
    toApiWorkItemBody(input as Record<string, unknown>),
  );
  return fromApiWorkItem(item);
}

export async function updateWorkItemApi(id: string, patch: Partial<WorkItem>): Promise<WorkItem> {
  const item = await request.patch<ApiWorkItem>(
    `/work-items/update/${id}`,
    toApiWorkItemBody(patch as Record<string, unknown>),
  );
  return fromApiWorkItem(item);
}

export const deleteWorkItemApi = (id: string) =>
  request.delete<{ deleted: number }>(`/work-items/delete/${id}`);

/** The visible list of one project in its new order (backlog and board). */
export const reorderWorkItemsApi = ({ projectId, ids }: { projectId: string; ids: string[] }) =>
  request.post<null>(`/work-items/reorder/${projectId}`, { ids });

export async function logTimeApi(
  id: string,
  input: { hours: number; note?: string },
): Promise<WorkItem> {
  const { workItem } = await request.post<{ timeLog: ApiTimeLog; workItem: ApiWorkItem }>(
    `/work-items/time-logs/${id}`,
    input,
  );
  return fromApiWorkItem(workItem);
}

export async function listCommentsApi(id: string): Promise<Comment[]> {
  const { comments } = await request.get<{ comments: ApiComment[] }>(`/comments/list/${id}`);
  return comments.map(fromApiComment);
}

export async function addCommentApi(
  id: string,
  input: { body: string; parentId?: string | null },
): Promise<Comment> {
  return fromApiComment(await request.post<ApiComment>(`/comments/${id}`, input));
}

export async function editCommentApi(id: string, body: string): Promise<Comment> {
  return fromApiComment(await request.patch<ApiComment>(`/comments/update/${id}`, { body }));
}

export const deleteCommentApi = (id: string) => request.delete<null>(`/comments/delete/${id}`);

export async function listActivityApi(id: string): Promise<Activity[]> {
  const { activities } = await request.get<{ activities: ApiActivity[] }>(`/activity/list/${id}`);
  return activities.map(fromApiActivity);
}

export async function listAttachmentsApi(id: string): Promise<Attachment[]> {
  const { attachments } = await request.get<{ attachments: ApiAttachment[] }>(
    `/attachments/list/${id}`,
  );
  return attachments.map(fromApiAttachment);
}

/** multipart/form-data with the file in the `file` field. */
export async function addAttachmentApi(id: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  // The client's default JSON header would turn the form into JSON; multipart keeps the file
  // (the browser adds the boundary).
  const attachment = await request.post<ApiAttachment>(`/attachments/${id}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return fromApiAttachment(attachment);
}
