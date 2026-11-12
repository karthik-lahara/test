import { createContext, useContext } from "react";

import type { WorkItemStatus, WorkItemType } from "@/shared/constants/workItem";

export type CreateMode = "describe" | "voice" | "manual";

export interface CreateOptions {
  mode?: CreateMode;
  projectId?: string;
  status?: WorkItemStatus;
  sprintId?: string | null;
  parentId?: string | null;
  /** Starting type, e.g. a story when adding under a feature. */
  type?: WorkItemType;
  /** Text to start the Describe box with (e.g. a draft from the assistant). */
  text?: string;
}

export const CreateWorkItemContext = createContext<(options?: CreateOptions) => void>(() => {});

/** Opens the create dialog from anywhere: the sidebar, a board column, a sprint. */
export const useCreateWorkItemDialog = () => useContext(CreateWorkItemContext);
