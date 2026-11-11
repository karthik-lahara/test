import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/shared/lib/invalidate";
import type { PageParams } from "@/shared/types/pagination";

import { getCall, listCalls } from "../api/calls.api";
import type { CallFilters } from "../calls.types";

export const callKeys = {
  all: [QUERY_ROOTS.calls] as const,
  lists: () => [...callKeys.all, "list"] as const,
  list: (params: PageParams & CallFilters) => [...callKeys.lists(), params] as const,
  detail: (id: string) => [...callKeys.all, "detail", id] as const,
};

export function useCalls(params: PageParams & CallFilters, enabled = true) {
  return useQuery({
    queryKey: callKeys.list(params),
    queryFn: () => listCalls(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCall(id: string | undefined) {
  return useQuery({
    queryKey: callKeys.detail(id ?? ""),
    queryFn: () => getCall(id!),
    enabled: Boolean(id),
    // The audio link is short-lived, so don't serve it from a stale cache.
    staleTime: 60 * 1000,
    // While the phone is still uploading, check back so the player appears by itself.
    refetchInterval: (query) =>
      query.state.data?.recordingStatus === "uploading" ? 15_000 : false,
  });
}
