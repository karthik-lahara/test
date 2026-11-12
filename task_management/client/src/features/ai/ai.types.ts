import type { Priority, WorkItemStatus, WorkItemType } from "@/shared/constants/workItem";

export type CommandSource = "text" | "voice";

/** Fields the AI filled in. Names are already resolved to ids by the API. */
export interface SuggestedFields {
  type: WorkItemType;
  title: string;
  description: string;
  priority: Priority;
  assigneeIds: string[];
  projectId: string | null;
  labels: string[];
  dueDate: string | null;
  estimateHours: number | null;
  acceptanceCriteria: string[];
  /** The epic, feature, story or task this sits under, when the text named one. */
  parentId: string | null;
}

/** What was understood from the text: fields to review, plus questions and warnings. */
export interface ParsedCommand {
  source: CommandSource;
  input: string;
  fields: SuggestedFields;
  detected: Array<{ field: string; label: string }>;
  questions: string[];
  warnings: string[];
  duplicates: Array<{ key: string; title: string; status: WorkItemStatus }>;
  confidence: number;
}

/** A parsed command the API saved as a pending suggestion (demo AI service). */
export interface AiSuggestion extends ParsedCommand {
  suggestionId: string;
  expiresAt: string;
  creditsLeft: number;
}

/** One turn in a conversation with the assistant. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A work item the assistant points at in its answer. */
export interface ChatItemRef {
  key: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  dueDate: string | null;
  projectName: string;
}

/** The assistant's answer: plain text, optional items to open, and follow-ups to offer. */
export interface AssistantReply {
  text: string;
  items: ChatItemRef[];
  /** Short follow-up questions shown as chips. */
  suggestions: string[];
  /** When the user asked to create something: the text to prefill the New task dialog with. */
  createDraft: string | null;
  /** When the user asked to break an item down: the proposed children. */
  breakdown: Breakdown | null;
}

/** A suggested split of one item into children, which the user ticks and creates. */
export interface Breakdown {
  parent: ChatItemRef & { id: string; projectId: string };
  childType: WorkItemType;
  /** Titles of the proposed children. */
  items: string[];
  /** How many children the parent already has. */
  existing: number;
}
