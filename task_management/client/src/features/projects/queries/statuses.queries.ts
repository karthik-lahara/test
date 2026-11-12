import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/shared/lib/invalidate";

import {
  createStatusApi,
  deleteStatusApi,
  listStatusesApi,
  type ProjectStatus,
  reorderStatusesApi,
  type StatusInput,
  updateStatusApi,
} from "../api/statuses.api";

export const statusKeys = {
  list: (projectId: string) => [QUERY_ROOTS.projects, "statuses", projectId] as const,
};

/** A project's statuses in board order (real API only; demo mode has no statuses API). */
export const useProjectStatuses = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: statusKeys.list(projectId),
    queryFn: () => listStatusesApi(projectId),
    enabled: enabled && Boolean(projectId),
  });

/** Every change refreshes the list: defaults, orders and item counts can all move. */
function useStatusMutation<TInput>(
  projectId: string,
  mutationFn: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusKeys.list(projectId) }),
  });
}

export const useCreateStatus = (projectId: string) =>
  useStatusMutation(projectId, (input: StatusInput & { isDefault?: boolean }) =>
    createStatusApi(projectId, input),
  );

export const useUpdateStatus = (projectId: string) =>
  useStatusMutation(
    projectId,
    ({ id, patch }: { id: string; patch: Partial<StatusInput> & { isDefault?: true } }) =>
      updateStatusApi(id, patch),
  );

export function useReorderStatuses(projectId: string) {
  const queryClient = useQueryClient();
  const key = statusKeys.list(projectId);
  return useMutation({
    mutationFn: (statusIds: string[]) => reorderStatusesApi(projectId, statusIds),
    // Move the rows at once; put them back if the server says no
    onMutate: async (statusIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectStatus[]>(key);
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]));
        queryClient.setQueryData(
          key,
          statusIds.map((id) => byId.get(id)).filter((s): s is ProjectStatus => Boolean(s)),
        );
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export const useDeleteStatus = (projectId: string) =>
  useStatusMutation(projectId, ({ id, moveToStatusId }: { id: string; moveToStatusId?: string }) =>
    deleteStatusApi(id, moveToStatusId),
  );
