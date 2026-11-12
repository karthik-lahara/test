import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateRoots, QUERY_ROOTS } from "@/shared/lib/invalidate";

import type { SuggestedFields } from "../ai.types";
import {
  approveSuggestionApi,
  assistantChatApi,
  parseCommandApi,
  rejectSuggestionApi,
} from "../api/ai.api";

export function useParseCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: parseCommandApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.organization),
  });
}

export function useApproveSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      edits,
    }: {
      id: string;
      edits: Partial<SuggestedFields> & Record<string, unknown>;
    }) => approveSuggestionApi(id, edits),
    onSuccess: () =>
      invalidateRoots(
        queryClient,
        QUERY_ROOTS.workItems,
        QUERY_ROOTS.projects,
        QUERY_ROOTS.dashboard,
        QUERY_ROOTS.notifications,
      ),
  });
}

export const useRejectSuggestion = () => useMutation({ mutationFn: rejectSuggestionApi });

/** One question to the assistant; the page keeps the conversation. */
export const useAssistantChat = () => useMutation({ mutationFn: assistantChatApi });
