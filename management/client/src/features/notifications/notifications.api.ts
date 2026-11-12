import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { currentOrganizationId } from "@/features/organization";
import { type ApiNotification, fromApiNotification } from "@/shared/api/contract";
import { fetchAllPages } from "@/shared/api/pages";
import { QUERY_ROOTS } from "@/shared/lib/invalidate";
import { request } from "@/shared/lib/request";
import type { Notification } from "@/shared/types/entities";

const KEY = [QUERY_ROOTS.notifications] as const;

// Paths and shapes of the API contract: /notifications/list/:organizationId and friends.

/** The newest 100 are enough for the inbox and the unread badge. */
async function listNotificationsApi(): Promise<Notification[]> {
  const organizationId = await currentOrganizationId();
  const items = await fetchAllPages<ApiNotification>(
    `/notifications/list/${organizationId}`,
    "notifications",
    {},
    1,
  );
  return items.map(fromApiNotification);
}

const markReadApi = (id: string) => request.post<null>(`/notifications/read/${id}`);

const markAllReadApi = async () =>
  request.post<{ updated: number }>(`/notifications/read-all/${await currentOrganizationId()}`);

/** Polls every minute; the real API also pushes over a socket. */
export const useNotifications = () =>
  useQuery({
    queryKey: KEY,
    queryFn: listNotificationsApi,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export function useUnreadCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.read).length ?? 0;
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markReadApi,
    onMutate: (id) =>
      queryClient.setQueryData<Notification[]>(KEY, (list) =>
        list?.map((n) => (n.id === id ? { ...n, read: true } : n)),
      ),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllReadApi,
    onMutate: () =>
      queryClient.setQueryData<Notification[]>(KEY, (list) =>
        list?.map((n) => ({ ...n, read: true })),
      ),
  });
}
