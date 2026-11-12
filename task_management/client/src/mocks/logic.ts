import dayjs from "dayjs";

import type { Health } from "@/shared/constants/workItem";
import type { Notification, Project, ProjectCounts, WorkItem } from "@/shared/types/entities";

import {
  activities,
  findUser,
  newId,
  notifications,
  projects,
  type StoredProject,
  users,
  workItems,
} from "./db";
import { MockHttpError } from "./router";

export function countsFor(projectId: string): ProjectCounts {
  const items = workItems.filter((w) => w.projectId === projectId && w.type !== "EPIC");
  const today = dayjs().format("YYYY-MM-DD");
  return {
    total: items.length,
    done: items.filter((w) => w.status === "DONE").length,
    inProgress: items.filter((w) => w.status === "IN_PROGRESS" || w.status === "QA").length,
    blocked: items.filter((w) => w.status === "BLOCKED").length,
    overdue: items.filter((w) => w.status !== "DONE" && w.dueDate && w.dueDate < today).length,
  };
}

/**
 * Health rules: Delayed when the end date has passed with work left, or 40% of the
 * open work is overdue; At Risk when progress trails the time used by more than 15 points
 * or anything is blocked; otherwise On Track.
 */
export function healthFor(project: StoredProject, counts: ProjectCounts): Health {
  if (project.status === "PLANNING" || project.status === "COMPLETED") return "ON_TRACK";
  const open = counts.total - counts.done;
  const today = dayjs().format("YYYY-MM-DD");
  if (
    (project.endDate && project.endDate < today && open > 0) ||
    (open > 0 && counts.overdue / open >= 0.4)
  ) {
    return "DELAYED";
  }
  if (project.startDate && project.endDate) {
    const span = dayjs(project.endDate).diff(project.startDate, "day") || 1;
    const used = Math.min(1, Math.max(0, dayjs().diff(project.startDate, "day") / span));
    const progress = counts.total ? counts.done / counts.total : 0;
    if (used - progress > 0.15 || counts.blocked > 0) return "AT_RISK";
  }
  return "ON_TRACK";
}

export function toProject(project: StoredProject, userId: string): Project {
  const counts = countsFor(project.id);
  const user = users.find((u) => u.id === userId);
  return {
    ...project,
    counts,
    health: healthFor(project, counts),
    favorite: Boolean(user?.favoriteProjectIds.includes(project.id)),
  };
}

export function findProject(idOrKey: string) {
  const project = projects.find(
    (p) => p.id === idOrKey || p.key.toLowerCase() === idOrKey.toLowerCase(),
  );
  if (!project) throw new MockHttpError(404, "Project not found");
  return project;
}

export function findItem(idOrKey: string) {
  const item = workItems.find(
    (w) => w.id === idOrKey || w.key.toLowerCase() === idOrKey.toLowerCase(),
  );
  if (!item) throw new MockHttpError(404, "Work item not found");
  return item;
}

export function withChildren(item: WorkItem): WorkItem {
  const children = workItems.filter((w) => w.parentId === item.id);
  return {
    ...item,
    childCount: children.length,
    childDoneCount: children.filter((c) => c.status === "DONE").length,
  };
}

export function logActivity(workItemId: string, actorId: string, text: string) {
  activities.push({
    id: newId("a"),
    workItemId,
    actorId,
    text,
    createdAt: new Date().toISOString(),
  });
}

export function notifyUser(
  userId: string,
  actorId: string,
  kind: Notification["kind"],
  item: WorkItem,
  title: string,
) {
  if (userId === actorId) return;
  const project = projects.find((p) => p.id === item.projectId);
  pushNotification(userId, {
    kind,
    title,
    body: item.title,
    actorId,
    workItemKey: item.key,
    projectKey: project?.key ?? null,
  });
}

export function pushNotification(
  userId: string,
  n: Omit<Notification, "id" | "read" | "createdAt">,
) {
  (notifications[userId] ??= []).push({
    ...n,
    id: newId("n"),
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export const nameOf = (id: string | null | undefined) =>
  id ? (findUser(id)?.name ?? "Someone") : "Nobody";

export function nextKey(project: StoredProject) {
  const numbers = workItems
    .filter((w) => w.projectId === project.id)
    .map((w) => Number(w.key.split("-")[1]) || 0);
  return `${project.key}-${Math.max(0, ...numbers) + 1}`;
}

/** Every item below this one: its children, their children, and so on. */
export function descendantsOf(id: string): WorkItem[] {
  const found: WorkItem[] = [];
  const queue = [id];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const child of workItems.filter((w) => w.parentId === parentId)) {
      found.push(child);
      queue.push(child.id);
    }
  }
  return found;
}

/**
 * A contract list: `{ <key>: items, pagination }`. `limit=all` returns everything (capped at
 * 1,000), as the contract allows for one project's board or backlog.
 */
export function paginate<T>(items: T[], query: Record<string, string>, key: string) {
  const all = query.limit === "all";
  const limit = all ? 1000 : Math.min(100, Math.max(1, Number(query.limit) || 20));
  const page = all ? 1 : Math.max(1, Number(query.page) || 1);
  const total = items.length;
  return {
    [key]: items.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Parents of an item, root first (the contract's `ancestorIds`). */
export function ancestorsOf(item: WorkItem): string[] {
  const ids: string[] = [];
  for (let parentId = item.parentId; parentId;) {
    ids.unshift(parentId);
    parentId = workItems.find((w) => w.id === parentId)?.parentId ?? null;
  }
  return ids;
}
