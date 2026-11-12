import { type ApiSprint, fromApiSprint } from "@/shared/api/contract";
import { env } from "@/shared/config/env";
import { request } from "@/shared/lib/request";
import type { Project, Sprint } from "@/shared/types/entities";

import type { ProjectInput, ProjectProgress, SprintInput } from "../projects.types";
import { backendProjectsApi } from "./projects.backend";

interface ProjectsApi {
  list(status?: string): Promise<Project[]>;
  get(idOrKey: string): Promise<Project>;
  create(input: ProjectInput): Promise<Project>;
  update(id: string, patch: Partial<Project>): Promise<Project>;
  toggleFavorite(id: string): Promise<Project>;
  progress(idOrKey: string): Promise<ProjectProgress>;
}

/** The demo API in src/mocks: /projects, /projects/:idOrKey, /favorite, /progress. */
const demoProjectsApi: ProjectsApi = {
  list: (status) => request.get<Project[]>("/projects", { params: { status } }),
  get: (idOrKey) => request.get<Project>(`/projects/${idOrKey}`),
  create: (input) => request.post<Project>("/projects", input),
  update: (id, patch) => request.patch<Project>(`/projects/${id}`, patch),
  toggleFavorite: (id) => request.post<Project>(`/projects/${id}/favorite`),
  progress: (id) => request.get<ProjectProgress>(`/projects/${id}/progress`),
};

const projectsApi: ProjectsApi = env.USE_MOCKS ? demoProjectsApi : backendProjectsApi;

export const listProjectsApi = (status?: string) => projectsApi.list(status);
export const getProjectApi = (idOrKey: string) => projectsApi.get(idOrKey);
export const createProjectApi = (input: ProjectInput) => projectsApi.create(input);
export const updateProjectApi = (id: string, patch: Partial<Project>) =>
  projectsApi.update(id, patch);
export const toggleFavoriteApi = (id: string) => projectsApi.toggleFavorite(id);
export const getProgressApi = (id: string) => projectsApi.progress(id);

// Sprints: paths and shapes of the API contract (/sprints/list/:projectId, /sprints/start/:id...).

export async function listSprintsApi(projectId: string): Promise<Sprint[]> {
  const { sprints } = await request.get<{ sprints: ApiSprint[] }>(`/sprints/list/${projectId}`);
  return sprints.map(fromApiSprint);
}

export async function createSprintApi({ projectId, ...input }: SprintInput): Promise<Sprint> {
  return fromApiSprint(await request.post<ApiSprint>(`/sprints/${projectId}`, input));
}

export async function startSprintApi(id: string): Promise<Sprint> {
  return fromApiSprint(await request.post<ApiSprint>(`/sprints/start/${id}`));
}

export async function updateSprintApi({
  id,
  name,
  goal,
  startDate,
  endDate,
}: Partial<SprintInput> & { id: string }): Promise<Sprint> {
  const body = { name, goal, startDate, endDate };
  return fromApiSprint(await request.patch<ApiSprint>(`/sprints/update/${id}`, body));
}

export const deleteSprintApi = (id: string) => request.delete<null>(`/sprints/delete/${id}`);

/** `moveTo` is a planned sprint's id, or "backlog", for the unfinished work. */
export async function completeSprintApi({ id, moveTo }: { id: string; moveTo: string }) {
  const result = await request.post<{ sprint: ApiSprint; moved: number; movedTo: string }>(
    `/sprints/complete/${id}`,
    { moveTo },
  );
  return { ...result, sprint: fromApiSprint(result.sprint) };
}
