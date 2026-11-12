import { MAX_PAGE_LIMIT } from "@utils/pagination";
import { ORGANIZATION_ROLES } from "../entities/organization-member.entity";

/**
 * Validates ListOrganizationMembersQuery (entities/organization.entity.ts).
 * Query values arrive as text ("2"); the validator turns them into numbers.
 */
export const listMembersQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_LIMIT },
    search: { type: "string", minLength: 1, maxLength: 100 },
    role: { type: "string", enum: [...ORGANIZATION_ROLES] },
  },
} as const;
