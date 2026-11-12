import { currentOrganizationId } from "@/features/organization";
import {
  type ApiWorkItem,
  type ApiWorkItemStatus,
  type ApiWorkItemType,
  fromApiStatus,
  fromApiType,
  fromApiWorkItem,
  fromApiWorkItemBody,
  toApiWorkItemBody,
} from "@/shared/api/contract";
import { request } from "@/shared/lib/request";
import type { WorkItem } from "@/shared/types/entities";

import type {
  AiSuggestion,
  AssistantReply,
  ChatItemRef,
  ChatMessage,
  CommandSource,
  SuggestedFields,
} from "../ai.types";

// Paths and shapes of the API contract: /ai/commands, /ai/suggestions, /ai/chat.

type ApiItemRef = Omit<ChatItemRef, "type" | "status"> & {
  type: ApiWorkItemType;
  status: ApiWorkItemStatus;
};

const fromApiItemRef = <T extends ApiItemRef>(ref: T) => ({
  ...ref,
  type: fromApiType(ref.type),
  status: fromApiStatus(ref.status),
});

interface ApiSuggestion extends Omit<AiSuggestion, "fields" | "duplicates"> {
  fields: Record<string, unknown>;
  duplicates: Array<{ key: string; title: string; status: ApiWorkItemStatus }>;
}

interface ApiAssistantReply extends Omit<AssistantReply, "items" | "breakdown"> {
  items: ApiItemRef[];
  breakdown: {
    parent: ApiItemRef & { id: string; projectId: string };
    childType: ApiWorkItemType;
    items: string[];
    existing: number;
  } | null;
}

/** Node checks the user and credits, asks the AI service, and returns a preview. Nothing is saved yet. */
export async function parseCommandApi(input: {
  text: string;
  source: CommandSource;
  projectId?: string;
  /** The item the new one goes under, when the dialog was opened from it. */
  parentId?: string;
}): Promise<AiSuggestion> {
  const result = await request.post<ApiSuggestion>(
    `/ai/commands/${await currentOrganizationId()}`,
    input,
  );
  return {
    ...result,
    fields: fromApiWorkItemBody(result.fields) as unknown as SuggestedFields,
    duplicates: result.duplicates.map((d) => ({ ...d, status: fromApiStatus(d.status) })),
  };
}

/** Creates the work item from the suggestion, with the user's edits on top. */
export async function approveSuggestionApi(
  id: string,
  edits: Partial<SuggestedFields> & Record<string, unknown>,
): Promise<WorkItem> {
  const item = await request.post<ApiWorkItem>(`/ai/suggestions/approve/${id}`, {
    edits: toApiWorkItemBody(edits),
  });
  return fromApiWorkItem(item);
}

export const rejectSuggestionApi = (id: string) =>
  request.post<null>(`/ai/suggestions/reject/${id}`);

/** Asks the assistant about the user's work. Read-only: it never changes anything itself. */
export async function assistantChatApi(messages: ChatMessage[]): Promise<AssistantReply> {
  const reply = await request.post<ApiAssistantReply>(`/ai/chat/${await currentOrganizationId()}`, {
    messages,
  });
  return {
    ...reply,
    items: reply.items.map(fromApiItemRef),
    breakdown: reply.breakdown && {
      ...reply.breakdown,
      parent: fromApiItemRef(reply.breakdown.parent),
      childType: fromApiType(reply.breakdown.childType),
    },
  };
}
