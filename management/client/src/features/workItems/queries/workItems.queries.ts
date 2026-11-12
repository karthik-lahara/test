import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateRoots, QUERY_ROOTS } from "@/shared/lib/invalidate";
import { toast } from "@/shared/lib/toast";
import type { WorkItem } from "@/shared/types/entities";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import {
  addAttachmentApi,
  addCommentApi,
  createWorkItemApi,
  deleteCommentApi,
  deleteWorkItemApi,
  editCommentApi,
  getWorkItemApi,
  listActivityApi,
  listAttachmentsApi,
  listCommentsApi,
  listWorkItemsApi,
  logTimeApi,
  reorderWorkItemsApi,
  updateWorkItemApi,
} from "../api/workItems.api";
import type { WorkItemFilters } from "../workItems.types";

const ROOT = QUERY_ROOTS.workItems;

export const workItemKeys = {
  lists: [ROOT, "list"] as const,
  list: (filters: WorkItemFilters) => [ROOT, "list", filters] as const,
  detail: (key: string) => [ROOT, "detail", key] as const,
  comments: (id: string) => [ROOT, "comments", id] as const,
  activity: (id: string) => [ROOT, "activity", id] as const,
  attachments: (id: string) => [ROOT, "attachments", id] as const,
};

export const useWorkItems = (filters: WorkItemFilters, enabled = true) =>
  useQuery({
    queryKey: workItemKeys.list(filters),
    queryFn: () => listWorkItemsApi(filters),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useWorkItem = (key: string) =>
  useQuery({ queryKey: workItemKeys.detail(key), queryFn: () => getWorkItemApi(key) });

/** Everything that shows counts or progress depends on work items. */
const refreshAll = (queryClient: ReturnType<typeof useQueryClient>) =>
  invalidateRoots(
    queryClient,
    QUERY_ROOTS.workItems,
    QUERY_ROOTS.projects,
    QUERY_ROOTS.dashboard,
    QUERY_ROOTS.notifications,
  );

export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createWorkItemApi, onSuccess: () => refreshAll(queryClient) });
}

/** Updates a work item and shows the change at once in every list that holds it. */
export function useUpdateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<WorkItem> }) =>
      updateWorkItemApi(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: workItemKeys.lists });
      const snapshot = queryClient.getQueriesData<WorkItem[]>({ queryKey: workItemKeys.lists });
      queryClient.setQueriesData<WorkItem[]>({ queryKey: workItemKeys.lists }, (items) =>
        items?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(getApiErrorMessage(error, "Could not save the change"));
    },
    onSuccess: (item) => queryClient.setQueryData(workItemKeys.detail(item.key), item),
    onSettled: () => refreshAll(queryClient),
  });
}

export function useDeleteWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: deleteWorkItemApi, onSuccess: () => refreshAll(queryClient) });
}

export function useReorderWorkItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderWorkItemsApi,
    onSettled: () => invalidateRoots(queryClient, QUERY_ROOTS.workItems),
  });
}

export function useLogTime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hours, note }: { id: string; hours: number; note?: string }) =>
      logTimeApi(id, { hours, note }),
    onSuccess: () => refreshAll(queryClient),
  });
}

export const useComments = (id: string) =>
  useQuery({ queryKey: workItemKeys.comments(id), queryFn: () => listCommentsApi(id) });

export const useActivity = (id: string) =>
  useQuery({ queryKey: workItemKeys.activity(id), queryFn: () => listActivityApi(id) });

export const useAttachments = (id: string) =>
  useQuery({ queryKey: workItemKeys.attachments(id), queryFn: () => listAttachmentsApi(id) });

export function useAddComment(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; parentId?: string | null }) =>
      addCommentApi(workItemId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.comments(workItemId) }),
  });
}

export function useEditComment(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => editCommentApi(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.comments(workItemId) }),
  });
}

export function useDeleteComment(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCommentApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.comments(workItemId) }),
  });
}

export function useAddAttachment(workItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => addAttachmentApi(workItemId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workItemKeys.attachments(workItemId) });
      void queryClient.invalidateQueries({ queryKey: workItemKeys.activity(workItemId) });
    },
  });
}
