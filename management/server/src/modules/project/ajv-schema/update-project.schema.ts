import { PROJECT_COLOR_PATTERN, PROJECT_PRIORITIES, PROJECT_STATUSES } from "../entities/project.entity";

/**
 * Validates UpdateProjectInput (entities/project.entity.ts).
 * key, leadId, memberIds, organizationId, createdBy and isArchived are rejected.
 */
export const updateProjectSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: "string", minLength: 2, maxLength: 100, pattern: "\\S" },
    // "" is allowed: it clears the field
    summary: { type: "string", maxLength: 150 },
    description: { type: "string", maxLength: 500 },
    status: { type: "string", enum: [...PROJECT_STATUSES] },
    priority: { type: "string", enum: [...PROJECT_PRIORITIES] },
    // null is allowed: it clears the field
    startDate: { type: "string", format: "date", nullable: true },
    targetDate: { type: "string", format: "date", nullable: true },
    color: { type: "string", pattern: PROJECT_COLOR_PATTERN, nullable: true },
  },
} as const;
