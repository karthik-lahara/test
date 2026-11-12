import dayjs from "dayjs";

import { currentOrganizationId } from "@/features/organization";
import type { Health, Priority, ProjectStatus } from "@/shared/constants/workItem";
import { request } from "@/shared/lib/request";
import type { Project } from "@/shared/types/entities";

import type { ProjectInput, ProjectProgress } from "../projects.types";

// Shapes of server/src/modules/project/entities/project.entity.ts

type ApiProjectStatus = "planning" | "active" | "on_hold" | "completed";
type ApiProjectPriority = "no_priority" | "low" | "medium" | "high" | "urgent";

interface ApiProject {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  summary?: string;
  description?: string;
  status: ApiProjectStatus;
  priority: ApiProjectPriority;
  leadId: string;
  startDate?: string;
  targetDate?: string;
  color?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

type ApiProjectListItem = Omit<ApiProject, "description"> & { memberCount: number };

interface ApiListProjectsResult {
  projects: ApiProjectListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ApiProjectDetails {
  project: ApiProject;
  members: Array<{ userId: string }>;
}

interface ApiCreateProjectResult {
  project: ApiProject;
  members: Array<{ userId: string }>;
}

const STATUS_FROM_API: Record<ApiProjectStatus, ProjectStatus> = {
  planning: "PLANNING",
  active: "ACTIVE",
  on_hold: "ON_HOLD",
  completed: "COMPLETED",
};

const STATUS_TO_API: Partial<Record<ProjectStatus, ApiProjectStatus>> = {
  PLANNING: "planning",
  ACTIVE: "active",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
};

const PRIORITY_FROM_API: Record<ApiProjectPriority, Priority> = {
  no_priority: "NONE",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
};

const PRIORITY_TO_API: Record<Priority, ApiProjectPriority> = {
  NONE: "no_priority",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
};

const DEFAULT_COLOR = "#7c6cff";
/** The server's MAX_PAGE_LIMIT. */
const PAGE_LIMIT = 100;
const UNSUPPORTED = "This change can't be saved yet: the server doesn't support it.";

/** The server only accepts its own user ids (24 hex characters). */
const isObjectId = (id: string) => /^[0-9a-f]{24}$/i.test(id);

const toDay = (value?: string | null) => (value ? value.slice(0, 10) : null);

// ---- Favourites: the server has none yet, so they are kept in this browser ----

const FAVORITES_KEY = "tm.favoriteProjects";

const favorites = {
  get(): string[] {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  },
  toggle(id: string) {
    const ids = favorites.get();
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: the star just won't stick */
    }
  },
};

/** No work items on the server yet: late once the end date has passed, otherwise on track. */
function healthOf(status: ProjectStatus, endDate: string | null): Health {
  if (status === "COMPLETED" || !endDate) return "ON_TRACK";
  return dayjs().isAfter(endDate, "day") ? "DELAYED" : "ON_TRACK";
}

/** Fills what the server does not track yet (health, counts, teams) with defaults. */
function toProject(p: ApiProject | ApiProjectListItem, memberIds: string[] = []): Project {
  const status = STATUS_FROM_API[p.status];
  const endDate = toDay(p.targetDate);
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    summary: p.summary ?? "",
    description: "description" in p ? (p.description ?? "") : "",
    status,
    priority: PRIORITY_FROM_API[p.priority],
    health: healthOf(status, endDate),
    leadId: p.leadId,
    memberIds,
    teamId: null,
    startDate: toDay(p.startDate),
    endDate,
    color: p.color ?? DEFAULT_COLOR,
    favorite: favorites.get().includes(p.id),
    counts: { total: 0, done: 0, inProgress: 0, blocked: 0, overdue: 0 },
    createdAt: p.createdAt,
  };
}

async function listAll(params: { search?: string } = {}): Promise<ApiProjectListItem[]> {
  const organizationId = await currentOrganizationId();
  const all: ApiProjectListItem[] = [];
  for (let page = 1; ; page++) {
    const result = await request.get<ApiListProjectsResult>(`/projects/list/${organizationId}`, {
      params: { ...params, page, limit: PAGE_LIMIT },
    });
    all.push(...result.projects);
    if (page >= result.pagination.totalPages) return all;
  }
}

async function getDetails(id: string): Promise<Project> {
  const { project, members } = await request.get<ApiProjectDetails>(`/projects/details/${id}`);
  return toProject(
    project,
    members.map((m) => m.userId),
  );
}

/** Project pages use the key in the URL (/projects/AXMS); the server looks projects up by id. */
async function getProject(idOrKey: string): Promise<Project> {
  if (isObjectId(idOrKey)) return getDetails(idOrKey);
  const key = idOrKey.toUpperCase();
  const match = (await listAll({ search: idOrKey })).find((p) => p.key === key);
  if (!match) throw new Error("Project not found");
  return getDetails(match.id);
}

/** Drops empty fields; the server rejects "" for dates and ids. */
const compact = <T extends object>(body: T) =>
  Object.fromEntries(
    Object.entries(body).filter(
      ([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length),
    ),
  ) as Partial<T>;

/** The real backend: /projects/:organizationId, /list, /details, /update, /delete. */
export const backendProjectsApi = {
  async list(status?: string): Promise<Project[]> {
    // Archived (deleted) projects are not listed by the server.
    if (status === "ARCHIVED") return [];
    const projects = (await listAll()).map((p) => toProject(p));
    return status ? projects.filter((p) => p.status === status) : projects;
  },

  get: getProject,

  async create(input: ProjectInput): Promise<Project> {
    const organizationId = await currentOrganizationId();
    const body = compact({
      name: input.name,
      key: input.key,
      summary: input.summary,
      description: input.description,
      status: STATUS_TO_API[input.status],
      priority: PRIORITY_TO_API[input.priority],
      // People pickers still list demo users until the server has a users API: only real ids go.
      leadId: isObjectId(input.leadId) ? input.leadId : undefined,
      memberIds: input.memberIds.filter(isObjectId),
      startDate: input.startDate,
      targetDate: input.endDate,
      color: input.color,
    });
    const { project, members } = await request.post<ApiCreateProjectResult>(
      `/projects/${organizationId}`,
      body,
    );
    return toProject(
      project,
      members.map((m) => m.userId),
    );
  },

  async update(id: string, patch: Partial<Project>): Promise<Project> {
    // Archiving is the server's delete (a soft delete).
    if (patch.status === "ARCHIVED") {
      const project = await getDetails(id);
      await request.delete(`/projects/delete/${id}`);
      return { ...project, status: "ARCHIVED" };
    }

    const { name, summary, description, status, priority, startDate, endDate, color, ...rest } =
      patch;
    if (Object.keys(rest).length > 0) throw new Error(UNSUPPORTED);

    // "" clears summary/description; null clears dates and colour.
    const body = Object.fromEntries(
      Object.entries({
        name,
        summary,
        description,
        status: status && STATUS_TO_API[status],
        priority: priority && PRIORITY_TO_API[priority],
        startDate: startDate === undefined ? undefined : startDate || null,
        targetDate: endDate === undefined ? undefined : endDate || null,
        color: color === undefined ? undefined : color || null,
      }).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(body).length === 0) throw new Error(UNSUPPORTED);

    await request.patch<ApiProject>(`/projects/update/${id}`, body);
    return getDetails(id);
  },

  async toggleFavorite(id: string): Promise<Project> {
    favorites.toggle(id);
    return getDetails(id);
  },

  /** Built from work items, which the server doesn't have yet: an empty chart. */
  async progress(idOrKey: string): Promise<ProjectProgress> {
    const project = await getProject(idOrKey);
    return { points: [], byAssignee: [], byLabel: [], endDate: project.endDate };
  },
};
