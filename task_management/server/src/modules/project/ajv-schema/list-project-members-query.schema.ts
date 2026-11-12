import { MAX_PAGE_LIMIT } from "@utils/pagination";
import { PROJECT_ROLES } from "../entities/project-member.entity";

/**
 * Validates ListProjectMembersQuery (entities/project.entity.ts).
 * Query values arrive as text ("2"); the validator turns them into numbers.
 */
export const listProjectMembersQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_LIMIT },
    search: { type: "string", minLength: 1, maxLength: 100 },
    role: { type: "string", enum: [...PROJECT_ROLES] },
  },
} as const;
