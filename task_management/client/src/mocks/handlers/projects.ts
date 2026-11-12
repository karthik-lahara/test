import dayjs from "dayjs";

import { toApiSprint } from "@/shared/api/contract";
import { isSprintPlannable } from "@/shared/constants/workItem";
import type { Sprint, WorkItem } from "@/shared/types/entities";

import { newId, projects, sprints, type StoredProject, users, workItems } from "../db";
import { descendantsOf, findProject, logActivity, pushNotification, toProject } from "../logic";
import { MockHttpError, route } from "../router";

route("GET", "/projects", ({ userId, query }) => {
  const user = users.find((u) => u.id === userId)!;
  const admin = user.role === "ORG_ADMIN" || user.role === "SUPER_ADMIN";
  return projects
    .filter((p) => admin || p.memberIds.includes(userId))
    .filter((p) => (query.status ? p.status === query.status : p.status !== "ARCHIVED"))
    .map((p) => toProject(p, userId));
});

route("POST", "/projects", ({ body, userId }) => {
  const key = String(body.key ?? "").toUpperCase();
  if (projects.some((p) => p.key === key)) {
    throw new MockHttpError(409, "Project key already used.", [
      { field: "key", message: "This key is already used" },
    ]);
  }
  const project: StoredProject = {
    id: newId("p"),
    key,
    name: String(body.name),
    summary: String(body.summary ?? ""),
    description: String(body.description ?? ""),
    status: (body.status as StoredProject["status"]) ?? "PLANNING",
    priority: (body.priority as StoredProject["priority"]) ?? "MEDIUM",
    leadId: (body.leadId as string) || userId,
    memberIds: Array.from(new Set([userId, ...((body.memberIds as string[]) ?? [])])),
    teamId: (body.teamId as string) || null,
    startDate: (body.startDate as string) || null,
    endDate: (body.endDate as string) || null,
    color: String(body.color ?? "#7c6cff"),
    favorite: false,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  return toProject(project, userId);
});

route("GET", "/projects/:id", ({ params, userId }) => toProject(findProject(params.id), userId));

route("PATCH", "/projects/:id", ({ params, body, userId }) => {
  const project = findProject(params.id);
  Object.assign(project, body);
  return toProject(project, userId);
});

route("POST", "/projects/:id/favorite", ({ params, userId }) => {
  const project = findProject(params.id);
  const user = users.find((u) => u.id === userId)!;
  user.favoriteProjectIds = user.favoriteProjectIds.includes(project.id)
    ? user.favoriteProjectIds.filter((id) => id !== project.id)
    : [...user.favoriteProjectIds, project.id];
  return toProject(project, userId);
});

/** Scope, started and completed per day, plus the split by assignee, for the overview chart. */
route("GET", "/projects/:id/progress", ({ params }) => {
  const project = findProject(params.id);
  const items = workItems.filter((w) => w.projectId === project.id && w.type !== "EPIC");
  const first = dayjs(project.startDate ?? project.createdAt);
  const last = dayjs();
  const points = [];
  for (let d = first; !d.isAfter(last, "day"); d = d.add(1, "day")) {
    const end = d.endOf("day").toISOString();
    const date = d.format("YYYY-MM-DD");
    points.push({
      date,
      scope: items.filter((w) => w.createdAt <= end).length,
      started: items.filter(
        (w) => w.status !== "TODO" && (w.startDate ?? "") <= date && w.createdAt <= end,
      ).length,
      completed: items.filter((w) => w.completedAt && w.completedAt <= end).length,
    });
  }
  const assigneeIds = Array.from(
    new Set(items.flatMap((w) => (w.assigneeIds.length ? w.assigneeIds : [""]))),
  );
  const byAssignee = assigneeIds
    .map((id) => {
      const mine = items.filter((w) =>
        id ? w.assigneeIds.includes(id) : w.assigneeIds.length === 0,
      );
      return {
        memberId: id || null,
        total: mine.length,
        done: mine.filter((w) => w.status === "DONE").length,
      };
    })
    .sort((a, b) => b.total - a.total);
  const labels = Array.from(new Set(items.flatMap((w) => w.labels)));
  const byLabel = labels.map((label) => {
    const mine = items.filter((w) => w.labels.includes(label));
    return { label, total: mine.length, done: mine.filter((w) => w.status === "DONE").length };
  });
  return { points, byAssignee, byLabel, endDate: project.endDate };
});

// ---- Sprints ----
route("GET", "/sprints/list/:projectId", ({ params }) => {
  const project = findProject(params.projectId);
  return {
    sprints: sprints
      .filter((s) => s.projectId === project.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map(toApiSprint),
  };
});

const findSprint = (id: string) => {
  const sprint = sprints.find((s) => s.id === id);
  if (!sprint) throw new MockHttpError(404, "Sprint not found");
  return sprint;
};

const short = (date: string) => dayjs(date).format("D MMM");

/** Sprints in one project never share a day. */
function assertNoOverlap(projectId: string, start: string, end: string, exceptId?: string) {
  if (end <= start)
    throw new MockHttpError(400, "End after the start date.", [
      { field: "endDate", message: "End after the start date" },
    ]);
  const clash = sprints.find(
    (s) =>
      s.projectId === projectId && s.id !== exceptId && s.startDate <= end && s.endDate >= start,
  );
  if (clash)
    throw new MockHttpError(
      409,
      `These dates overlap ${clash.name} (${short(clash.startDate)} – ${short(clash.endDate)}).`,
      [
        {
          field: "startDate",
          message: `Overlaps ${clash.name}. Start after ${short(clash.endDate)}.`,
        },
      ],
    );
}

const byIdMap = () => new Map(workItems.map((w) => [w.id, w]));
const plannable = (item: WorkItem, byId: Map<string, WorkItem>) =>
  isSprintPlannable(item.type, item.parentId ? byId.get(item.parentId)?.type : null);

route("POST", "/sprints/:projectId", ({ params, body }) => {
  const project = findProject(params.projectId);
  assertNoOverlap(project.id, String(body.startDate), String(body.endDate));
  const sprint: Sprint = {
    id: newId("s"),
    projectId: project.id,
    name: String(body.name),
    goal: String(body.goal ?? ""),
    startDate: String(body.startDate),
    endDate: String(body.endDate),
    status: "PLANNED",
  };
  sprints.push(sprint);
  return toApiSprint(sprint);
});

route("POST", "/sprints/start/:id", ({ params, userId }) => {
  const sprint = sprints.find((s) => s.id === params.id);
  if (!sprint) throw new MockHttpError(404, "Sprint not found");
  if (sprints.some((s) => s.projectId === sprint.projectId && s.status === "ACTIVE")) {
    throw new MockHttpError(409, "Complete the active sprint before starting another.");
  }
  sprint.status = "ACTIVE";
  const project = projects.find((p) => p.id === sprint.projectId)!;
  for (const id of project.memberIds) {
    if (id !== userId) {
      pushNotification(id, {
        kind: "SPRINT_STARTED",
        title: `${sprint.name} started`,
        body: sprint.goal,
        actorId: userId,
        workItemKey: null,
        projectKey: project.key,
      });
    }
  }
  return toApiSprint(sprint);
});

route("PATCH", "/sprints/update/:id", ({ params, body }) => {
  const sprint = findSprint(params.id);
  if (sprint.status === "COMPLETED")
    throw new MockHttpError(400, "A completed sprint can't be changed.");
  const startDate = String(body.startDate ?? sprint.startDate);
  const endDate = String(body.endDate ?? sprint.endDate);
  if (sprint.status === "ACTIVE" && startDate !== sprint.startDate)
    throw new MockHttpError(400, "The sprint has started, so its start date is fixed.", [
      { field: "startDate", message: "Fixed once the sprint has started" },
    ]);
  assertNoOverlap(sprint.projectId, startDate, endDate, sprint.id);
  Object.assign(sprint, {
    name: String(body.name ?? sprint.name).trim() || sprint.name,
    goal: String(body.goal ?? sprint.goal),
    startDate,
    endDate,
  });
  return toApiSprint(sprint);
});

/** Only a sprint that hasn't started can be deleted; its work goes back to the backlog. */
route("DELETE", "/sprints/delete/:id", ({ params, userId }) => {
  const sprint = findSprint(params.id);
  if (sprint.status !== "PLANNED")
    throw new MockHttpError(400, "Only a sprint that hasn't started can be deleted.");
  for (const item of workItems.filter((w) => w.sprintId === sprint.id)) {
    item.sprintId = null;
    logActivity(item.id, userId, `moved to the backlog when ${sprint.name} was deleted`);
  }
  sprints.splice(sprints.indexOf(sprint), 1);
  return null;
});

/**
 * Completes the sprint. Unfinished stories and bugs (with all their tasks) move where the
 * user chose: a planned sprint or the backlog. Finished work stays as the sprint's record.
 */
route("POST", "/sprints/complete/:id", ({ params, body, userId }) => {
  const sprint = findSprint(params.id);
  if (sprint.status !== "ACTIVE")
    throw new MockHttpError(400, "Only the active sprint can be completed.");
  const moveTo = String(body.moveTo ?? "backlog");
  const target =
    moveTo === "backlog"
      ? null
      : sprints.find(
          (s) => s.id === moveTo && s.projectId === sprint.projectId && s.status === "PLANNED",
        );
  if (target === undefined)
    throw new MockHttpError(400, "Pick a planned sprint or the backlog for the unfinished work.");
  sprint.status = "COMPLETED";
  const byId = byIdMap();
  let moved = 0;
  for (const item of workItems.filter(
    (w) => w.sprintId === sprint.id && w.status !== "DONE" && plannable(w, byId),
  )) {
    for (const each of [item, ...descendantsOf(item.id)]) {
      each.sprintId = target?.id ?? null;
      logActivity(
        each.id,
        userId,
        `moved to ${target ? target.name : "the backlog"} when ${sprint.name} closed`,
      );
    }
    moved++;
  }
  return { sprint: toApiSprint(sprint), moved, movedTo: target?.name ?? "Backlog" };
});
