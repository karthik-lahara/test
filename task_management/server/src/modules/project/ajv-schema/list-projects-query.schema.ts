import { MAX_PAGE_LIMIT, PROJECT_PRIORITIES, PROJECT_STATUSES } from "../entities/project.entity";

/**
 * Validates ListProjectsQuery (entities/project.entity.ts).
 * Query values arrive as text ("2"); the validator turns them into numbers.
 */
export const listProjectsQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_LIMIT },
    status: { type: "string", enum: [...PROJECT_STATUSES] },
    priority: { type: "string", enum: [...PROJECT_PRIORITIES] },
    search: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;
