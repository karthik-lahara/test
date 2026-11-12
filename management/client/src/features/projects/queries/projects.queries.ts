import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateRoots, QUERY_ROOTS } from "@/shared/lib/invalidate";
import { toast } from "@/shared/lib/toast";
import type { Project } from "@/shared/types/entities";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import {
  completeSprintApi,
  createProjectApi,
  createSprintApi,
  deleteSprintApi,
  getProgressApi,
  getProjectApi,
  listProjectsApi,
  listSprintsApi,
  startSprintApi,
  toggleFavoriteApi,
  updateProjectApi,
  updateSprintApi,
} from "../api/projects.api";

export const projectKeys = {
  list: (status?: string) => [QUERY_ROOTS.projects, "list", status ?? "open"] as const,
  detail: (key: string) => [QUERY_ROOTS.projects, "detail", key] as const,
  progress: (key: string) => [QUERY_ROOTS.projects, "progress", key] as const,
  sprints: (projectId: string) => [QUERY_ROOTS.sprints, projectId] as const,
};

export const useProjects = (status?: string) =>
  useQuery({ queryKey: projectKeys.list(status), queryFn: () => listProjectsApi(status) });

export const useProject = (key: string) =>
  useQuery({
    queryKey: projectKeys.detail(key),
    queryFn: () => getProjectApi(key),
    enabled: Boolean(key),
  });

export const useProjectProgress = (key: string) =>
  useQuery({ queryKey: projectKeys.progress(key), queryFn: () => getProgressApi(key) });

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProjectApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.projects, QUERY_ROOTS.dashboard),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Project> }) =>
      updateProjectApi(id, patch),
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.projects, QUERY_ROOTS.dashboard),
    onError: (error) => toast.error(getApiErrorMessage(error, error.message)),
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: toggleFavoriteApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.projects),
  });
}

export const useSprints = (projectId: string) =>
  useQuery({
    queryKey: projectKeys.sprints(projectId),
    queryFn: () => listSprintsApi(projectId),
    enabled: Boolean(projectId),
  });

export function useCreateSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSprintApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.sprints),
  });
}

export function useStartSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startSprintApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.sprints, QUERY_ROOTS.notifications),
  });
}

export function useUpdateSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSprintApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.sprints),
  });
}

export function useDeleteSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSprintApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.sprints, QUERY_ROOTS.workItems),
  });
}

export function useCompleteSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeSprintApi,
    onSuccess: () =>
      invalidateRoots(
        queryClient,
        QUERY_ROOTS.sprints,
        QUERY_ROOTS.workItems,
        QUERY_ROOTS.projects,
      ),
  });
}
