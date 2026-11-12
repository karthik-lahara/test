import dayjs from "dayjs";

import {
  type ApiPriority,
  type ApiWorkItemStatus,
  type ApiWorkItemType,
  fromApiPriority,
  fromApiStatus,
  fromApiType,
  fromApiWorkItemBody,
  toApiAttachment,
  toApiComment,
  toApiWorkItem,
} from "@/shared/api/contract";
import {
  canParent,
  followsParentSprint,
  hasStoryPoints,
  PARENT_TYPES,
  STATUS_META,
  TYPE_META,
} from "@/shared/constants/workItem";
import type { Activity, WorkItem } from "@/shared/types/entities";

import {
  activities,
  attachments,
  comments,
  newId,
  organization,
  projects,
  sprints,
  users,
  workItems,
} from "../db";
import {
  ancestorsOf,
  descendantsOf,
  findItem,
  findProject,
  logActivity,
  nameOf,
  nextKey,
  notifyUser,
  paginate,
  withChildren,
} from "../logic";
import { MockHttpError, route } from "../router";

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

/** A work item as the contract sends it. */
export const wire = (item: WorkItem) => toApiWorkItem(item, ancestorsOf(item));

route("GET", "/work-items/list/:organizationId", ({ query, userId }) => {
  const search = (query.search ?? "").toLowerCase();
  const project = query.projectId ? findProject(query.projectId) : null;
  const assignee = query.assigneeId === "me" ? userId : query.assigneeId;
  const statuses = query.status?.split(",").map((v) => fromApiStatus(v as ApiWorkItemStatus));
  const priorities = query.priority?.split(",").map((v) => fromApiPriority(v as ApiPriority));
  const types = query.type?.split(",").map((v) => fromApiType(v as ApiWorkItemType));
  let items = workItems
    .filter((w) => !project || w.projectId === project.id)
    .filter(
      (w) =>
        !assignee ||
        (assignee === "none" ? w.assigneeIds.length === 0 : w.assigneeIds.includes(assignee)),
    )
    .filter((w) => !statuses || statuses.includes(w.status))
    .filter((w) => !priorities || priorities.includes(w.priority))
    .filter((w) => !types || types.includes(w.type))
    .filter(
      (w) =>
        !query.sprintId ||
        (query.sprintId === "backlog" ? w.sprintId === null : w.sprintId === query.sprintId),
    )
    .filter((w) => !query.parentId || w.parentId === query.parentId)
    .filter((w) => !query.label || w.labels.includes(query.label))
    .filter((w) => !query.dueBefore || (w.dueDate !== null && w.dueDate <= query.dueBefore))
    .filter((w) => !query.dueAfter || (w.dueDate !== null && w.dueDate >= query.dueAfter))
    .filter((w) => query.includeSubtasks === "true" || query.parentId || w.type !== "SUBTASK")
    .filter(
      (w) =>
        !search || w.title.toLowerCase().includes(search) || w.key.toLowerCase().includes(search),
    );
  items = [...items].sort((a, b) =>
    query.sort === "order"
      ? a.order - b.order
      : query.sort === "due"
        ? (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
        : query.sort === "updated"
          ? b.updatedAt.localeCompare(a.updatedAt)
          : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            b.updatedAt.localeCompare(a.updatedAt),
  );
  return paginate(items.map(wire), query, "workItems");
});

route("GET", "/work-items/details/:id", ({ params }) => wire(withChildren(findItem(params.id))));
route("GET", "/work-items/by-key/:organizationId/:key", ({ params }) =>
  wire(withChildren(findItem(params.key))),
);

export function createWorkItem(
  body: Record<string, unknown>,
  userId: string,
  createdVia: WorkItem["createdVia"],
) {
  const project = findProject(String(body.projectId ?? ""));
  const title = String(body.title ?? "").trim();
  if (!title)
    throw new MockHttpError(400, "Title is required", [
      { field: "title", message: "Give the work item a title" },
    ]);
  // Keep the hierarchy valid: Epic → Feature → Story → Task / Bug → Subtask.
  const type = (body.type as WorkItem["type"]) ?? "TASK";
  const parentId = (body.parentId as string) || null;
  if (parentId) {
    const parent = workItems.find((w) => w.id === parentId);
    if (!parent) throw new MockHttpError(400, "The parent item no longer exists.");
    if (parent.projectId !== project.id)
      throw new MockHttpError(400, "The parent must be in the same project.");
    if (!canParent(type, parent.type)) {
      const allowed = PARENT_TYPES[type].map((t) => TYPE_META[t].label.toLowerCase());
      throw new MockHttpError(
        400,
        allowed.length
          ? `A ${TYPE_META[type].label.toLowerCase()} goes under a ${allowed.join(" or ")}, not a ${TYPE_META[parent.type].label.toLowerCase()}.`
          : `An ${TYPE_META[type].label.toLowerCase()} is top level and has no parent.`,
      );
    }
  } else if (type === "SUBTASK") {
    throw new MockHttpError(400, "A subtask needs a parent task or bug.");
  }

  const assigneeIds = (body.assigneeIds as string[] | undefined) ?? [];
  if (!organization.allowMultipleAssignees && assigneeIds.length > 1) {
    throw new MockHttpError(400, "This organisation allows one assignee per work item.");
  }
  // A story's tasks live in the story's sprint; epics and features are never in one.
  const parentItem = parentId ? workItems.find((w) => w.id === parentId) : undefined;
  const sprintId = followsParentSprint(parentItem?.type)
    ? (parentItem?.sprintId ?? null)
    : type === "EPIC" || type === "FEATURE"
      ? null
      : (body.sprintId as string) || null;
  const now = new Date().toISOString();
  const item: WorkItem = {
    id: newId("w"),
    key: nextKey(project),
    projectId: project.id,
    type,
    title,
    description: String(body.description ?? ""),
    acceptanceCriteria: ((body.acceptanceCriteria as string[] | undefined) ?? [])
      .filter(Boolean)
      .map((text) => ({ id: newId("ac"), text, done: false })),
    status: (body.status as WorkItem["status"]) ?? "TODO",
    priority: (body.priority as WorkItem["priority"]) ?? "NONE",
    assigneeIds,
    reporterId: userId,
    parentId,
    sprintId,
    labels: (body.labels as string[] | undefined) ?? [],
    startDate: (body.startDate as string) || null,
    dueDate: (body.dueDate as string) || null,
    estimateHours: body.estimateHours ? Number(body.estimateHours) : null,
    loggedHours: 0,
    storyPoints: hasStoryPoints(type) && body.storyPoints ? Number(body.storyPoints) : null,
    createdVia,
    order: workItems.length + 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  workItems.push(item);
  logActivity(
    item.id,
    userId,
    createdVia === "MANUAL"
      ? "created this work item"
      : `created this work item with AI (${createdVia === "AI_VOICE" ? "voice" : "text"}), after review`,
  );
  for (const id of assigneeIds) {
    logActivity(item.id, userId, `assigned to ${nameOf(id)}`);
    notifyUser(id, userId, "ASSIGNED", item, `${item.key} assigned to you`);
  }
  return withChildren(item);
}

route("POST", "/work-items/:projectId", ({ params, body, userId }) =>
  wire(
    createWorkItem({ ...fromApiWorkItemBody(body), projectId: params.projectId }, userId, "MANUAL"),
  ),
);

/** Creates several children of one parent at once (Break down). */
route("POST", "/work-items/bulk/:projectId", ({ params, body, userId }) => {
  const titles = (body.titles as string[] | undefined) ?? [];
  if (titles.length === 0 || titles.length > 20)
    throw new MockHttpError(400, "Send between 1 and 20 titles.");
  const base = fromApiWorkItemBody({ type: body.type, parentId: body.parentId });
  return {
    workItems: titles.map((title) =>
      wire(createWorkItem({ ...base, projectId: params.projectId, title }, userId, "MANUAL")),
    ),
  };
});

route("PATCH", "/work-items/update/:id", ({ params, body: wireBody, userId }) => {
  const body = fromApiWorkItemBody(wireBody);
  const item = findItem(params.id);
  const before = { ...item };

  // Sprint moves: plan the story, and its tasks come along.
  if ("sprintId" in body && body.sprintId !== item.sprintId) {
    const parent = item.parentId ? workItems.find((w) => w.id === item.parentId) : undefined;
    if (followsParentSprint(parent?.type))
      throw new MockHttpError(
        400,
        `${item.key} follows its ${TYPE_META[parent!.type].label.toLowerCase()} ${parent!.key} into sprints. Move ${parent!.key} instead.`,
      );
    if (item.type === "EPIC" || item.type === "FEATURE")
      throw new MockHttpError(400, "Epics and features span sprints. Plan their stories instead.");
  }

  Object.assign(item, body, { updatedAt: new Date().toISOString() });

  if ("sprintId" in body && body.sprintId !== before.sprintId) {
    for (const child of descendantsOf(item.id)) child.sprintId = item.sprintId;
  }

  if (body.status && body.status !== before.status) {
    logActivity(
      item.id,
      userId,
      `changed status from ${STATUS_META[before.status].label} to ${STATUS_META[item.status].label}`,
    );
    item.completedAt = item.status === "DONE" ? new Date().toISOString() : null;
    for (const id of new Set([...item.assigneeIds, item.reporterId])) {
      notifyUser(
        id,
        userId,
        item.status === "QA" ? "MOVED_TO_QA" : "STATUS_CHANGED",
        item,
        `${item.key} moved to ${STATUS_META[item.status].label}`,
      );
    }
  }
  if (body.assigneeIds) {
    const added = item.assigneeIds.filter((id) => !before.assigneeIds.includes(id));
    const removed = before.assigneeIds.filter((id) => !item.assigneeIds.includes(id));
    for (const id of added) {
      logActivity(item.id, userId, `assigned to ${nameOf(id)}`);
      notifyUser(
        id,
        userId,
        before.assigneeIds.length ? "REASSIGNED" : "ASSIGNED",
        item,
        `${item.key} assigned to you`,
      );
    }
    for (const id of removed) logActivity(item.id, userId, `unassigned ${nameOf(id)}`);
  }
  if (body.priority && body.priority !== before.priority)
    logActivity(item.id, userId, `set priority to ${item.priority.toLowerCase()}`);
  if ("dueDate" in body && body.dueDate !== before.dueDate) {
    logActivity(
      item.id,
      userId,
      item.dueDate ? `set ETA to ${dayjs(item.dueDate).format("MMM D")}` : "removed the ETA",
    );
  }
  if ("sprintId" in body && body.sprintId !== before.sprintId) {
    logActivity(
      item.id,
      userId,
      item.sprintId
        ? `moved to ${sprints.find((s) => s.id === item.sprintId)?.name}`
        : "moved to the backlog",
    );
  }
  if (body.title && body.title !== before.title)
    logActivity(item.id, userId, "renamed this work item");
  if ("estimateHours" in body && body.estimateHours !== before.estimateHours) {
    logActivity(item.id, userId, `set the estimate to ${item.estimateHours ?? 0}h`);
  }
  return wire(withChildren(item));
});

/** Removes the item and its whole subtree. */
route("DELETE", "/work-items/delete/:id", ({ params }) => {
  const item = findItem(params.id);
  const ids = new Set([item.id, ...descendantsOf(item.id).map((w) => w.id)]);
  for (let i = workItems.length - 1; i >= 0; i--)
    if (ids.has(workItems[i].id)) workItems.splice(i, 1);
  return { deleted: ids.size };
});

/** Moves one project's items to a new position (backlog and board ordering). */
route("POST", "/work-items/reorder/:projectId", ({ params, body }) => {
  const project = findProject(params.projectId);
  (body.ids as string[]).forEach((id, index) => {
    const item = workItems.find((w) => w.id === id);
    if (item && item.projectId !== project.id)
      throw new MockHttpError(400, "Every item must be in this project.");
    if (item) item.order = index + 1;
  });
  return null;
});

interface TimeLog {
  id: string;
  workItemId: string;
  userId: string;
  hours: number;
  note: string;
  loggedOn: string;
  createdAt: string;
}
const timeLogs: TimeLog[] = [];

route("POST", "/work-items/time-logs/:id", ({ params, body, userId }) => {
  const item = findItem(params.id);
  const hours = Number(body.hours);
  if (!(hours > 0 && hours <= 24))
    throw new MockHttpError(400, "Hours must be between 0 and 24", [
      { field: "hours", message: "Between 0.25 and 24" },
    ]);
  item.loggedHours = Math.round((item.loggedHours + hours) * 100) / 100;
  logActivity(item.id, userId, `logged ${hours}h${body.note ? `: ${String(body.note)}` : ""}`);
  const timeLog: TimeLog = {
    id: newId("tl"),
    workItemId: item.id,
    userId,
    hours,
    note: String(body.note ?? ""),
    loggedOn: String(body.loggedOn ?? dayjs().format("YYYY-MM-DD")),
    createdAt: new Date().toISOString(),
  };
  timeLogs.push(timeLog);
  return { timeLog, workItem: wire(withChildren(item)) };
});

route("GET", "/work-items/time-logs/:id", ({ params }) => {
  const item = findItem(params.id);
  return { timeLogs: timeLogs.filter((t) => t.workItemId === item.id) };
});

route("DELETE", "/work-items/time-logs/delete/:id", ({ params, userId }) => {
  const index = timeLogs.findIndex((t) => t.id === params.id);
  if (index < 0) throw new MockHttpError(404, "Time log not found");
  const role = users.find((u) => u.id === userId)?.role;
  if (timeLogs[index].userId !== userId && role !== "ORG_ADMIN" && role !== "PROJECT_MANAGER")
    throw new MockHttpError(403, "You can only delete your own time logs.");
  const [log] = timeLogs.splice(index, 1);
  const item = findItem(log.workItemId);
  item.loggedHours = Math.max(0, Math.round((item.loggedHours - log.hours) * 100) / 100);
  return { workItem: wire(withChildren(item)) };
});

/** Ids of the people a comment mentions as @Full Name. */
const mentionsIn = (text: string) =>
  users.filter((u) => text.includes(`@${u.name}`)).map((u) => u.id);

route("GET", "/comments/list/:id", ({ params }) => {
  const item = findItem(params.id);
  return {
    comments: comments
      .filter((c) => c.workItemId === item.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => toApiComment(c, mentionsIn(c.body))),
  };
});

route("POST", "/comments/:id", ({ params, body, userId }) => {
  const item = findItem(params.id);
  const text = String(body.body ?? "").trim();
  if (!text)
    throw new MockHttpError(400, "Write a comment first", [
      { field: "body", message: "Write a comment first" },
    ]);
  const comment = {
    id: newId("c"),
    workItemId: item.id,
    authorId: userId,
    body: text,
    parentId: (body.parentId as string) || null,
    createdAt: new Date().toISOString(),
    editedAt: null,
  };
  comments.push(comment);
  for (const user of users) {
    if (text.includes(`@${user.name}`))
      notifyUser(
        user.id,
        userId,
        "MENTION",
        item,
        `${nameOf(userId)} mentioned you on ${item.key}`,
      );
  }
  for (const id of item.assigneeIds)
    notifyUser(id, userId, "COMMENT", item, `New comment on ${item.key}`);
  return toApiComment(comment, mentionsIn(comment.body));
});

route("PATCH", "/comments/update/:id", ({ params, body, userId }) => {
  const comment = comments.find((c) => c.id === params.id);
  if (!comment) throw new MockHttpError(404, "Comment not found");
  if (comment.authorId !== userId)
    throw new MockHttpError(403, "You can only edit your own comments.");
  comment.body = String(body.body);
  comment.editedAt = new Date().toISOString();
  return toApiComment(comment, mentionsIn(comment.body));
});

route("DELETE", "/comments/delete/:id", ({ params, userId }) => {
  const index = comments.findIndex((c) => c.id === params.id);
  if (index < 0) throw new MockHttpError(404, "Comment not found");
  const role = users.find((u) => u.id === userId)?.role;
  if (comments[index].authorId !== userId && role !== "ORG_ADMIN" && role !== "PROJECT_MANAGER") {
    throw new MockHttpError(403, "You can't delete this comment.");
  }
  comments.splice(index, 1);
  return null;
});

/** The demo stores activity as text; the contract also names the kind of change. */
const ACTIONS: Array<[RegExp, string]> = [
  [/^created this work item with AI/, "created_with_ai"],
  [/^created/, "created"],
  [/^changed status/, "status_changed"],
  [/^assigned/, "assigned"],
  [/^unassigned/, "unassigned"],
  [/^set priority/, "priority_changed"],
  [/^(set ETA|removed the ETA)/, "due_date_changed"],
  [/^set the estimate/, "estimate_changed"],
  [/^moved to/, "sprint_changed"],
  [/^renamed/, "renamed"],
  [/^logged/, "time_logged"],
  [/^attached/, "attached"],
];
const toApiActivity = (a: Activity) => ({
  ...a,
  action: ACTIONS.find(([pattern]) => pattern.test(a.text))?.[1] ?? "updated",
  field: null,
  from: null,
  to: null,
});

route("GET", "/activity/list/:id", ({ params }) => {
  const item = findItem(params.id);
  return {
    activities: activities
      .filter((a) => a.workItemId === item.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toApiActivity),
  };
});

route("GET", "/attachments/list/:id", ({ params }) => {
  const item = findItem(params.id);
  return {
    attachments: attachments.filter((a) => a.workItemId === item.id).map((a) => toApiAttachment(a)),
  };
});

/** multipart/form-data with the file in `file`; the demo keeps only its name and size. */
route("POST", "/attachments/:id", ({ params, body, userId }) => {
  const item = findItem(params.id);
  const upload = body.file as { name: string; size: number; type: string } | undefined;
  if (!upload) throw new MockHttpError(400, "Choose a file to attach.");
  if (upload.size > 10 * 1024 * 1024) throw new MockHttpError(413, "Files can be up to 10 MB.");
  const file = {
    id: newId("f"),
    workItemId: item.id,
    name: upload.name,
    size: upload.size,
    kind: upload.type.startsWith("image/") ? ("image" as const) : ("document" as const),
    uploadedBy: userId,
    createdAt: new Date().toISOString(),
  };
  attachments.push(file);
  logActivity(item.id, userId, `attached ${file.name}`);
  return toApiAttachment(file, upload.type || undefined);
});

route("GET", "/attachments/download/:id", ({ params }) => {
  if (!attachments.some((a) => a.id === params.id))
    throw new MockHttpError(404, "Attachment not found");
  // The demo keeps no file contents.
  return { url: "#", expiresAt: dayjs().add(5, "minute").toISOString() };
});

route("DELETE", "/attachments/delete/:id", ({ params }) => {
  const index = attachments.findIndex((a) => a.id === params.id);
  if (index < 0) throw new MockHttpError(404, "Attachment not found");
  attachments.splice(index, 1);
  return null;
});

// ---- Dashboard ----
route("GET", "/dashboard/:organizationId", ({ userId }) => {
  const today = dayjs().format("YYYY-MM-DD");
  const mine = workItems.filter((w) => w.assigneeIds.includes(userId) && w.type !== "EPIC");
  const open = mine.filter((w) => w.status !== "DONE");
  const weekAgo = dayjs().subtract(7, "day").toISOString();
  const activeUsers = users.filter((u) => u.status === "ACTIVE");
  return {
    me: {
      open: open.length,
      inProgress: open.filter((w) => w.status === "IN_PROGRESS" || w.status === "QA").length,
      overdue: open.filter((w) => w.dueDate && w.dueDate < today).length,
      dueToday: open.filter((w) => w.dueDate === today).length,
      completedThisWeek: mine.filter((w) => w.completedAt && w.completedAt >= weekAgo).length,
      loggedHours: mine.reduce((sum, w) => sum + w.loggedHours, 0),
      estimatedHours: mine.reduce((sum, w) => sum + (w.estimateHours ?? 0), 0),
      stories: open.filter((w) => w.type === "STORY").length,
      subtasks: open.filter((w) => w.type === "SUBTASK").length,
    },
    // The organisation block is for admins only.
    org: !["ORG_ADMIN", "SUPER_ADMIN"].includes(users.find((u) => u.id === userId)?.role ?? "")
      ? null
      : {
          employees: activeUsers.length,
          invited: users.filter((u) => u.status === "INVITED").length,
          teams: new Set(users.flatMap((u) => u.teamIds)).size,
          activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
          projectManagers: users.filter(
            (u) => u.role === "PROJECT_MANAGER" || u.role === "ORG_ADMIN",
          ).length,
          workload: activeUsers
            .map((u) => {
              const items = workItems.filter(
                (w) => w.assigneeIds.includes(u.id) && w.status !== "DONE" && w.type !== "EPIC",
              );
              return {
                userId: u.id,
                open: items.length,
                hours: items.reduce(
                  (s, w) => s + Math.max(0, (w.estimateHours ?? 0) - w.loggedHours),
                  0,
                ),
              };
            })
            .sort((a, b) => b.hours - a.hours),
        },
    weekly: Array.from({ length: 7 }, (_, index) => {
      const date = dayjs().subtract(6 - index, "day");
      const start = date.startOf("day").toISOString();
      const end = date.endOf("day").toISOString();
      return {
        date: date.format("YYYY-MM-DD"),
        completed: workItems.filter(
          (w) => w.completedAt && w.completedAt >= start && w.completedAt <= end,
        ).length,
        created: workItems.filter((w) => w.createdAt >= start && w.createdAt <= end).length,
      };
    }),
  };
});
