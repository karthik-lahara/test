import { useOutletContext } from "react-router-dom";

import type { Project } from "@/shared/types/entities";

/** The project loaded by ProjectLayout, shared with its tab pages. */
export const useProjectContext = () => useOutletContext<{ project: Project }>().project;
