import dayjs from "dayjs";

import {
  followsParentSprint,
  isSprintPlannable,
  type Priority,
  type WorkItemStatus,
  type WorkItemType,
} from "@/shared/constants/workItem";
import type {
  Activity,
  Attachment,
  Comment,
  Member,
  Notification,
  Organization,
  Project,
  Sprint,
  Team,
  WorkItem,
} from "@/shared/types/entities";

// In-browser demo data. Dates are relative to today so the demo always looks current.

let seed = 7;
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

const day = (offset: number) => dayjs().add(offset, "day").format("YYYY-MM-DD");
const at = (offset: number, hour = 10) =>
  dayjs()
    .add(offset, "day")
    .hour(hour)
    .minute(Math.floor(rand() * 59))
    .toISOString();

let counter = 1000;
export const newId = (prefix: string) => `${prefix}_${(counter++).toString(36)}`;

export type StoredProject = Omit<Project, "health" | "counts">;

export interface MockUser extends Member {
  password: string;
  favoriteProjectIds: string[];
}

export const organization: Organization = {
  id: "org_1",
  name: "Lahara Protocol Labs",
  slug: "lahara",
  timeZone: "Asia/Kolkata",
  workingDays: [1, 2, 3, 4, 5],
  plan: "TEAM",
  seats: 25,
  allowMultipleAssignees: true,
  aiEnabled: true,
  aiCreditsLeft: 4820,
};

function member(
  id: string,
  name: string,
  email: string,
  role: Member["role"],
  designation: string,
  teamIds: string[],
  skills: string[],
  extra: Partial<MockUser> = {},
): MockUser {
  return {
    id,
    name,
    email,
    avatarColor: "",
    role,
    status: "ACTIVE",
    designation,
    teamIds,
    reportingManagerId: id === "u_amal" ? null : "u_amal",
    skills,
    availability: "AVAILABLE",
    timeZone: "Asia/Kolkata",
    joinedAt: day(-400 + Math.floor(rand() * 300)),
    password: "demo123",
    favoriteProjectIds: [],
    ...extra,
  };
}

export const users: MockUser[] = [
  member(
    "u_amal",
    "Amal Pradeep",
    "amal@lahara.dev",
    "ORG_ADMIN",
    "Engineering Lead",
    ["t_web", "t_ai"],
    ["Architecture", "Node.js", "Product"],
    { avatarColor: "#7c6cff", favoriteProjectIds: ["p_axms", "p_task"] },
  ),
  member(
    "u_shahanas",
    "Shahanas",
    "shahanas@lahara.dev",
    "MEMBER",
    "MERN Developer",
    ["t_web"],
    ["React", "Node.js", "MongoDB"],
    { avatarColor: "#f472b6", favoriteProjectIds: ["p_task"] },
  ),
  member(
    "u_ramya",
    "Ramya",
    "ramya@lahara.dev",
    "MEMBER",
    "MERN Developer",
    ["t_web"],
    ["React", "Express", "Tailwind"],
    { avatarColor: "#4cc38a", availability: "BUSY" },
  ),
  member(
    "u_aisawarya",
    "Aisawarya Lakshmi",
    "aisawarya@lahara.dev",
    "PROJECT_MANAGER",
    "AI Engineer",
    ["t_ai"],
    ["Python", "FastAPI", "LLMs"],
    { avatarColor: "#f5a524" },
  ),
  member(
    "u_ahammed",
    "Ahammed Shihabudeen",
    "ahammed@lahara.dev",
    "MEMBER",
    "AI Engineer",
    ["t_ai"],
    ["Python", "Speech-to-text", "Redis"],
    { avatarColor: "#38bdf8" },
  ),
  member(
    "u_jaziya",
    "Jaziya Nizar",
    "jaziya@lahara.dev",
    "MEMBER",
    "AI Engineer",
    ["t_ai"],
    ["Python", "Prompting", "Evaluation"],
    { avatarColor: "#a78bfa", availability: "ON_LEAVE" },
  ),
  member(
    "u_arjun",
    "Arjun Menon",
    "arjun@lahara.dev",
    "MEMBER",
    "Product Designer",
    ["t_design"],
    ["Figma", "UX research"],
    { avatarColor: "#f06a6a" },
  ),
  member(
    "u_fathima",
    "Fathima Rahman",
    "fathima@lahara.dev",
    "MEMBER",
    "QA Engineer",
    ["t_design"],
    ["Test plans", "Playwright"],
    { avatarColor: "#2dd4bf" },
  ),
  member(
    "u_vishnu",
    "Vishnu Das",
    "vishnu@lahara.dev",
    "MEMBER",
    "DevOps Engineer",
    [],
    ["Docker", "CI/CD"],
    { avatarColor: "#64748b", status: "INVITED" },
  ),
  member(
    "u_nikhil",
    "Nikhil Raj",
    "nikhil@lahara.dev",
    "MEMBER",
    "Intern",
    ["t_web"],
    ["JavaScript"],
    { avatarColor: "#94a3b8", status: "INACTIVE" },
  ),
];

export const teams: Team[] = [
  {
    id: "t_web",
    name: "Web (MERN)",
    description: "Builds the core product: React, Node.js, Express and MongoDB.",
    color: "#7c6cff",
    leadId: "u_amal",
    memberIds: ["u_amal", "u_shahanas", "u_ramya", "u_nikhil"],
  },
  {
    id: "t_ai",
    name: "AI",
    description: "Python FastAPI service, prompts, voice and evaluation.",
    color: "#f5a524",
    leadId: "u_aisawarya",
    memberIds: ["u_amal", "u_aisawarya", "u_ahammed", "u_jaziya"],
  },
  {
    id: "t_design",
    name: "Design & QA",
    description: "Product design, usability and release testing.",
    color: "#f472b6",
    leadId: "u_arjun",
    memberIds: ["u_arjun", "u_fathima"],
  },
];

export const projects: StoredProject[] = [
  {
    id: "p_task",
    key: "TASK",
    name: "Task Platform",
    summary: "AI-first work management for every team.",
    description:
      "Core product: organisations, projects, work items, sprints and dashboards, with AI task creation from text and voice.",
    status: "ACTIVE",
    priority: "HIGH",
    leadId: "u_amal",
    memberIds: [
      "u_amal",
      "u_shahanas",
      "u_ramya",
      "u_aisawarya",
      "u_ahammed",
      "u_jaziya",
      "u_fathima",
    ],
    teamId: "t_web",
    startDate: day(-45),
    endDate: day(40),
    color: "#7c6cff",
    favorite: false,
    createdAt: at(-46),
  },
  {
    id: "p_axms",
    key: "AXMS",
    name: "AXMS Website",
    summary: "Marketing site and customer portal.",
    description: "Public website, sign-up flow and the customer portal for AXMS.",
    status: "ACTIVE",
    priority: "MEDIUM",
    leadId: "u_shahanas",
    memberIds: ["u_amal", "u_shahanas", "u_ramya", "u_arjun", "u_fathima"],
    teamId: "t_web",
    startDate: day(-60),
    endDate: day(10),
    color: "#4cc38a",
    favorite: false,
    createdAt: at(-61),
  },
  {
    id: "p_voice",
    key: "VOX",
    name: "Voice Assistant",
    summary: "Speech-to-text and command parsing service.",
    description: "Record, transcribe and turn speech into structured work items.",
    status: "ACTIVE",
    priority: "HIGH",
    leadId: "u_aisawarya",
    memberIds: ["u_aisawarya", "u_ahammed", "u_jaziya", "u_amal"],
    teamId: "t_ai",
    startDate: day(-30),
    endDate: day(-2),
    color: "#f5a524",
    favorite: false,
    createdAt: at(-31),
  },
  {
    id: "p_mobile",
    key: "MOB",
    name: "Mobile App",
    summary: "Phone-friendly views for on-the-go updates.",
    description: "Planning the mobile experience.",
    status: "PLANNING",
    priority: "LOW",
    leadId: "u_arjun",
    memberIds: ["u_arjun", "u_ramya"],
    teamId: "t_design",
    startDate: day(20),
    endDate: day(110),
    color: "#38bdf8",
    favorite: false,
    createdAt: at(-5),
  },
  {
    id: "p_qa",
    key: "QA",
    name: "Release 2.4 QA",
    summary: "Testing the payments app before the 2.4 release.",
    description:
      "Test scripts, regression runs and bug fixes for the 2.4 release of the payments app.",
    status: "ACTIVE",
    priority: "HIGH",
    leadId: "u_amal",
    memberIds: ["u_amal", "u_ramya", "u_fathima", "u_arjun"],
    teamId: "t_design",
    startDate: day(-14),
    endDate: day(9),
    color: "#f06a6a",
    favorite: false,
    createdAt: at(-15),
  },
];

export const sprints: Sprint[] = [];
for (const project of projects.filter((p) => p.status === "ACTIVE")) {
  sprints.push(
    {
      id: newId("s"),
      projectId: project.id,
      name: `${project.key} Sprint 1`,
      goal: "Foundations and first usable flow.",
      startDate: day(-28),
      endDate: day(-15),
      status: "COMPLETED",
    },
    {
      id: newId("s"),
      projectId: project.id,
      name: `${project.key} Sprint 2`,
      goal: "Ship the core screens end to end.",
      startDate: day(-14),
      endDate: day(0),
      status: "ACTIVE",
    },
    {
      id: newId("s"),
      projectId: project.id,
      name: `${project.key} Sprint 3`,
      goal: "Polish, QA and release.",
      startDate: day(1),
      endDate: day(14),
      status: "PLANNED",
    },
  );
}

// Each row: [depth, type, title]. An item's parent is the nearest row above it one level up.
const TITLES: Record<string, Array<[number, WorkItemType, string]>> = {
  p_task: [
    [0, "EPIC", "Work item management"],
    [1, "FEATURE", "Kanban board with drag and drop"],
    [2, "STORY", "As a member I can create a task with title, ETA and estimate"],
    [3, "TASK", "Work item REST API (CRUD)"],
    [3, "TASK", "Comments with mentions and replies"],
    [3, "TASK", "Activity history on every change"],
    [3, "BUG", "Board loses order after refresh"],
    [2, "STORY", "As a manager I can plan the sprint from the backlog"],
    [3, "TASK", "Backlog reorder and move to sprint"],
    [3, "TASK", "Sprint start and complete flow"],
    [3, "TASK", "Time logging on work items"],
    [1, "FEATURE", "Role-based dashboards"],
    [2, "STORY", "As a lead I can see project health at a glance"],
    [3, "TASK", "Project health rules (on track / at risk / delayed)"],
    [3, "TASK", "Notification inbox and unread badge"],
    [3, "BUG", "Due date shows one day off in IST"],
    [0, "EPIC", "AI task creation"],
    [1, "FEATURE", "Text and voice commands"],
    [2, "STORY", "As a user I can describe a task in plain words and review it"],
    [3, "TASK", "Voice recorder component"],
    [3, "TASK", "POST /ai/commands endpoint with credit check"],
    [3, "TASK", "Audit log for AI suggestions"],
    [1, "FEATURE", "Team onboarding"],
    [2, "STORY", "As an admin I can invite users by email"],
    [3, "TASK", "Attachments upload to object storage"],
  ],
  p_axms: [
    [0, "EPIC", "User module"],
    [1, "FEATURE", "Accounts and sign-up"],
    [2, "STORY", "As a customer I can update my profile"],
    [3, "TASK", "User creation form with validation"],
    [3, "TASK", "Sign-up page design"],
    [3, "BUG", "Password reset email not sent"],
    [3, "TASK", "Customer portal dashboard"],
    [0, "EPIC", "Marketing website"],
    [1, "FEATURE", "Public pages"],
    [2, "STORY", "As a visitor I can find pricing and contact the team"],
    [3, "TASK", "Pricing page"],
    [3, "TASK", "Contact form with spam check"],
    [3, "BUG", "Mobile nav overlaps hero"],
    [3, "BUG", "Broken image on About page"],
    [1, "FEATURE", "Performance and tracking"],
    [3, "TASK", "SEO meta tags for public pages"],
    [3, "TASK", "Lighthouse performance fixes"],
    [3, "TASK", "Analytics events"],
    [3, "TASK", "Cookie consent banner"],
  ],
  p_voice: [
    [0, "EPIC", "Speech pipeline"],
    [1, "FEATURE", "Command understanding"],
    [2, "STORY", "As a user I can create a task by speaking"],
    [3, "TASK", "Speech-to-text provider integration"],
    [3, "TASK", "Command parser schema"],
    [3, "TASK", "Entity extraction: assignee, priority, due date"],
    [3, "BUG", "Hindi numbers parsed as text"],
    [3, "TASK", "Confidence scores and follow-up questions"],
    [1, "FEATURE", "Service quality"],
    [3, "TASK", "Evaluation set of 200 commands"],
    [3, "TASK", "FastAPI service token auth"],
    [3, "TASK", "Usage and cost tracking"],
  ],
  p_mobile: [
    [0, "EPIC", "Mobile foundations"],
    [1, "FEATURE", "App shell"],
    [3, "TASK", "Wireframes for My work"],
    [3, "TASK", "Navigation pattern study"],
  ],
};

const LABELS = ["frontend", "backend", "ai", "design", "infra", "qa"];

export const workItems: WorkItem[] = [];
for (const project of projects) {
  const projectSprints = sprints.filter((s) => s.projectId === project.id);
  let number = 1;
  const parents: Array<string | null> = [];
  for (const [depth, type, title] of TITLES[project.id] ?? []) {
    let parentId: string | null = null;
    for (let d = depth - 1; d >= 0 && !parentId; d--) parentId = parents[d] ?? null;
    const status: WorkItemStatus =
      project.status === "PLANNING"
        ? "TODO"
        : pick<WorkItemStatus>([
            "TODO",
            "TODO",
            "IN_PROGRESS",
            "IN_PROGRESS",
            "QA",
            "DONE",
            "DONE",
            "DONE",
            "BLOCKED",
          ]);
    const created = -Math.floor(rand() * 40) - 2;
    const sprint =
      type === "EPIC" || type === "FEATURE" || projectSprints.length === 0
        ? null
        : status === "DONE"
          ? pick(projectSprints.slice(0, 2))
          : rand() > 0.3
            ? projectSprints[1]
            : rand() > 0.5
              ? projectSprints[2]
              : null;
    const members = project.memberIds;
    const id = newId("w");
    const estimate = type === "EPIC" ? null : pick([2, 3, 4, 6, 8, 12, 16]);
    const due = type === "EPIC" ? project.endDate : day(Math.floor(rand() * 22) - 3);
    workItems.push({
      id,
      key: `${project.key}-${number++}`,
      projectId: project.id,
      type,
      title,
      description:
        type === "EPIC"
          ? `Groups the work for **${title.toLowerCase()}**.`
          : `${title}.\n\nKeep the change small and covered by tests. Link the pull request in a comment when it is ready for review.`,
      acceptanceCriteria:
        type === "STORY" || type === "FEATURE"
          ? [
              {
                id: newId("ac"),
                text: "Works for every role that can see the project",
                done: status === "DONE",
              },
              {
                id: newId("ac"),
                text: "Errors are shown next to the field that caused them",
                done: status === "DONE",
              },
              { id: newId("ac"), text: "Covered by an end-to-end test", done: false },
            ]
          : [],
      status,
      priority: pick<Priority>([
        "URGENT",
        "HIGH",
        "HIGH",
        "MEDIUM",
        "MEDIUM",
        "MEDIUM",
        "LOW",
        "NONE",
      ]),
      assigneeIds: type === "EPIC" ? [project.leadId!] : rand() > 0.12 ? [pick(members)] : [],
      reporterId: project.leadId ?? "u_amal",
      parentId,
      sprintId: sprint?.id ?? null,
      labels: rand() > 0.4 ? [pick(LABELS)] : [],
      startDate: day(created + 1),
      dueDate: due,
      estimateHours: estimate,
      loggedHours: status === "TODO" || !estimate ? 0 : Math.round(estimate * (0.4 + rand() * 0.9)),
      storyPoints: type === "STORY" || type === "BUG" ? pick([1, 2, 3, 5, 8]) : null,
      createdVia: rand() > 0.8 ? pick<WorkItem["createdVia"]>(["AI_TEXT", "AI_VOICE"]) : "MANUAL",
      order: number,
      createdAt: at(created),
      updatedAt: at(Math.min(-1, created + 5)),
      completedAt:
        status === "DONE" ? at(Math.min(-1, created + 3 + Math.floor(rand() * 10))) : null,
    });
    parents[depth] = id;
    parents.length = depth + 1;
  }
}

// Release 2.4 QA: fixed items (not random), so the demo admin's overdue work is everyday
// testing work rather than the Task Platform's own backlog.
{
  const qa: Array<{
    type: WorkItemType;
    title: string;
    status: WorkItemStatus;
    priority: Priority;
    assignee: string;
    due: number;
    estimate: number | null;
  }> = [
    {
      type: "EPIC",
      title: "Release 2.4 testing",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignee: "u_amal",
      due: 9,
      estimate: null,
    },
    {
      type: "TASK",
      title: "Write test scripts for the checkout flow",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignee: "u_amal",
      due: -3,
      estimate: 8,
    },
    {
      type: "TASK",
      title: "Regression test plan for release 2.4",
      status: "TODO",
      priority: "URGENT",
      assignee: "u_amal",
      due: -2,
      estimate: 6,
    },
    {
      type: "BUG",
      title: "Payment page times out on slow networks",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignee: "u_amal",
      due: -1,
      estimate: 4,
    },
    {
      type: "TASK",
      title: "Prepare test data for UAT",
      status: "TODO",
      priority: "MEDIUM",
      assignee: "u_ramya",
      due: 2,
      estimate: 4,
    },
    {
      type: "TASK",
      title: "Automate login and sign-up tests",
      status: "TODO",
      priority: "MEDIUM",
      assignee: "u_fathima",
      due: 4,
      estimate: 12,
    },
    {
      type: "BUG",
      title: "Refund amount rounds the wrong way",
      status: "QA",
      priority: "HIGH",
      assignee: "u_arjun",
      due: 1,
      estimate: 3,
    },
  ];
  let epicId: string | null = null;
  qa.forEach((q, index) => {
    const id = newId("w");
    if (q.type === "EPIC") epicId = id;
    workItems.push({
      id,
      key: `QA-${index + 1}`,
      projectId: "p_qa",
      type: q.type,
      title: q.title,
      description:
        q.type === "EPIC"
          ? "Groups the testing work for the 2.4 release."
          : `${q.title}.\n\nAttach the test run or screenshots in a comment when it is done.`,
      acceptanceCriteria: [],
      status: q.status,
      priority: q.priority,
      assigneeIds: [q.assignee],
      reporterId: "u_amal",
      parentId: q.type === "EPIC" ? null : epicId,
      sprintId: null,
      labels: ["qa"],
      startDate: day(-12),
      dueDate: day(q.due),
      estimateHours: q.estimate,
      loggedHours: q.status === "TODO" || !q.estimate ? 0 : Math.round(q.estimate / 2),
      storyPoints: q.type === "BUG" ? 3 : null,
      createdVia: index === 2 ? "AI_TEXT" : "MANUAL",
      order: index + 1,
      createdAt: at(-12),
      updatedAt: at(-1),
      completedAt: null,
    });
  });
}

// The demo admin's late work is the QA project above; their other items get a date ahead.
for (const w of workItems) {
  if (
    w.projectId !== "p_qa" &&
    w.status !== "DONE" &&
    w.assigneeIds.includes("u_amal") &&
    w.dueDate &&
    w.dueDate < day(0)
  ) {
    w.dueDate = day(5);
  }
}

// A few subtasks so the detail page has a breakdown.
const parentForSubtasks = workItems.find((w) => w.title === "Work item REST API (CRUD)")!;
["Model and indexes", "Validation schemas", "Controller and routes", "Tests"].forEach(
  (title, index) => {
    workItems.push({
      ...parentForSubtasks,
      id: newId("w"),
      key: `TASK-${26 + index}`,
      type: "SUBTASK",
      title,
      description: "",
      acceptanceCriteria: [],
      parentId: parentForSubtasks.id,
      status: index < 2 ? "DONE" : index === 2 ? "IN_PROGRESS" : "TODO",
      estimateHours: 2,
      loggedHours: index < 2 ? 2 : index === 2 ? 1 : 0,
      storyPoints: null,
      completedAt: index < 2 ? at(-2) : null,
      order: 100 + index,
    });
  },
);

// Parents follow their children: all done → Done, any started → In Progress, else To Do.
for (let pass = 0; pass < 5; pass++) {
  for (const parent of workItems) {
    const kids = workItems.filter((w) => w.parentId === parent.id);
    if (!kids.length) continue;
    const status: WorkItemStatus = kids.every((k) => k.status === "DONE")
      ? "DONE"
      : kids.some((k) => k.status !== "TODO")
        ? "IN_PROGRESS"
        : "TODO";
    parent.status = status;
    parent.completedAt = status === "DONE" ? (parent.completedAt ?? parent.updatedAt) : null;
  }
}

// The first sprint's finished stories, so velocity has history to work from.
const SPRINT_ONE_STORIES: Record<string, Array<[string, number]>> = {
  p_task: [
    ["As a member I can sign in and see my projects", 5],
    ["As an admin I can create a project with its own key", 5],
    ["As a member I can see the work assigned to me", 3],
  ],
  p_axms: [
    ["As a visitor I can see the home page on mobile", 5],
    ["As an editor I can change page text without a deploy", 5],
    ["As a visitor I can send a contact request", 3],
  ],
  p_voice: [
    ["As a user I can record a short command", 5],
    ["As a user I can see my words as text while I speak", 5],
    ["As a user I can retry when speech isn't understood", 3],
  ],
};
for (const sprint of sprints.filter((s) => s.status === "COMPLETED")) {
  const project = projects.find((p) => p.id === sprint.projectId)!;
  const feature = workItems.find((w) => w.projectId === project.id && w.type === "FEATURE");
  let number =
    Math.max(
      0,
      ...workItems
        .filter((w) => w.projectId === project.id)
        .map((w) => Number(w.key.split("-")[1]) || 0),
    ) + 1;
  for (const [title, points] of SPRINT_ONE_STORIES[project.id] ?? []) {
    workItems.push({
      id: newId("w"),
      key: `${project.key}-${number++}`,
      projectId: project.id,
      type: "STORY",
      title,
      description: `${title}.`,
      acceptanceCriteria: [],
      status: "DONE",
      priority: "MEDIUM",
      assigneeIds: [pick(project.memberIds)],
      reporterId: project.leadId ?? "u_amal",
      parentId: feature?.id ?? null,
      sprintId: sprint.id,
      labels: [],
      startDate: sprint.startDate,
      dueDate: sprint.endDate,
      estimateHours: points * 3,
      loggedHours: points * 3,
      storyPoints: points,
      createdVia: "MANUAL",
      order: number,
      createdAt: at(-30),
      updatedAt: at(-16),
      completedAt: at(-16),
    });
  }
}

// Sprints the way a real team would have them.
{
  const byId = new Map(workItems.map((w) => [w.id, w]));
  const parentType = (w: WorkItem) => (w.parentId ? byId.get(w.parentId)?.type : null);
  const active = (projectId: string) =>
    sprints.find((s) => s.projectId === projectId && s.status === "ACTIVE");
  for (const item of workItems) {
    if (!isSprintPlannable(item.type, parentType(item))) continue;
    const sprint = sprints.find((s) => s.id === item.sprintId);
    // Unfinished work never stays in a closed sprint: it rolled over to the current one.
    if (sprint?.status === "COMPLETED" && item.status !== "DONE")
      item.sprintId = active(item.projectId)?.id ?? null;
  }
  // A story's tasks (and a task's subtasks) sit in the same sprint as their parent.
  for (let pass = 0; pass < 3; pass++)
    for (const item of workItems)
      if (followsParentSprint(parentType(item))) item.sprintId = byId.get(item.parentId!)!.sprintId;
  // Work finished inside a sprint has its finish date inside that sprint, so the
  // burndown and velocity read correctly.
  const today = dayjs().startOf("day");
  for (const item of workItems) {
    const sprint = sprints.find((s) => s.id === item.sprintId);
    if (!sprint || item.status !== "DONE") continue;
    const start = dayjs(sprint.startDate);
    const end = dayjs(sprint.endDate);
    const yesterday = today.subtract(1, "day");
    const last = end.isBefore(yesterday) ? end : yesterday;
    const span = Math.max(0, last.diff(start, "day"));
    item.completedAt = start
      .add(Math.floor(rand() * (span + 1)), "day")
      .hour(15)
      .toISOString();
  }
}

export const comments: Comment[] = [];
export const activities: Activity[] = [];
export const attachments: Attachment[] = [];

const COMMENT_LINES = [
  "Picked this up, will push a draft PR today.",
  "@Amal Pradeep can you confirm the expected behaviour for guests?",
  "Blocked on the API contract, waiting for the schema.",
  "Looks good on staging. Moving to QA.",
  "Added screenshots of the edge case in attachments.",
];

for (const item of workItems.slice(0, 40)) {
  activities.push({
    id: newId("a"),
    workItemId: item.id,
    actorId: item.reporterId,
    text: `created this ${item.createdVia === "MANUAL" ? "" : "with AI "}work item`.replace(
      "  ",
      " ",
    ),
    createdAt: item.createdAt,
  });
  if (item.assigneeIds[0]) {
    activities.push({
      id: newId("a"),
      workItemId: item.id,
      actorId: item.reporterId,
      text: `assigned to ${users.find((u) => u.id === item.assigneeIds[0])!.name}`,
      createdAt: item.createdAt,
    });
  }
  if (item.status !== "TODO") {
    activities.push({
      id: newId("a"),
      workItemId: item.id,
      actorId: item.assigneeIds[0] ?? item.reporterId,
      text: `moved to ${item.status === "DONE" ? "Done" : item.status === "QA" ? "Requires QA" : item.status === "BLOCKED" ? "Blocked" : "In Progress"}`,
      createdAt: item.updatedAt,
    });
  }
  if (rand() > 0.45) {
    const count = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      comments.push({
        id: newId("c"),
        workItemId: item.id,
        authorId: pick(projects.find((p) => p.id === item.projectId)!.memberIds),
        body: pick(COMMENT_LINES),
        parentId: null,
        createdAt: at(-6 + i * 2, 11 + i),
        editedAt: null,
      });
    }
  }
  if (rand() > 0.7) {
    attachments.push({
      id: newId("f"),
      workItemId: item.id,
      name: pick(["requirements.pdf", "screenshot-board.png", "test-evidence.xlsx", "flow.fig"]),
      size: Math.floor(rand() * 2_000_000) + 20_000,
      kind: rand() > 0.5 ? "image" : "document",
      uploadedBy: item.reporterId,
      createdAt: at(-4),
    });
  }
}

export const notifications: Record<string, Notification[]> = {};
function notify(
  userId: string,
  n: Omit<Notification, "id" | "read" | "createdAt">,
  offsetHours: number,
  read = false,
) {
  (notifications[userId] ??= []).push({
    ...n,
    id: newId("n"),
    read,
    createdAt: dayjs().subtract(offsetHours, "hour").toISOString(),
  });
}

for (const user of users) {
  const mine = workItems.filter((w) => w.assigneeIds.includes(user.id)).slice(0, 4);
  mine.forEach((item, index) => {
    const project = projects.find((p) => p.id === item.projectId)!;
    notify(
      user.id,
      {
        kind: "ASSIGNED",
        title: `${item.key} assigned to you`,
        body: item.title,
        actorId: item.reporterId,
        workItemKey: item.key,
        projectKey: project.key,
      },
      2 + index * 7,
      index > 1,
    );
  });
  notify(
    user.id,
    {
      kind: "MENTION",
      title: "You were mentioned",
      body: "Can you confirm the expected behaviour for guests?",
      actorId: "u_shahanas",
      workItemKey: "TASK-6",
      projectKey: "TASK",
    },
    1,
  );
  notify(
    user.id,
    {
      kind: "MOVED_TO_QA",
      title: "AXMS-2 moved to QA",
      body: "User creation form with validation",
      actorId: "u_ramya",
      workItemKey: "AXMS-2",
      projectKey: "AXMS",
    },
    5,
  );
  notify(
    user.id,
    {
      kind: "SPRINT_STARTED",
      title: "TASK Sprint 2 started",
      body: "Ship the core screens end to end.",
      actorId: "u_amal",
      workItemKey: null,
      projectKey: "TASK",
    },
    26,
    true,
  );
  notify(
    user.id,
    {
      kind: "OVERDUE",
      title: "VOX project is past its end date",
      body: "Voice Assistant was due 2 days ago.",
      actorId: null,
      workItemKey: null,
      projectKey: "VOX",
    },
    30,
    true,
  );
}

export const findUser = (id: string) => users.find((u) => u.id === id);

export function publicUser(user: MockUser): Member {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, favoriteProjectIds, ...rest } = user;
  return rest;
}
