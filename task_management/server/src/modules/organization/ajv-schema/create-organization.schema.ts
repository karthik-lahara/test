import { ORGANIZATION_TYPES } from "../entities/organization.entity";

/**
 * Validates CreateOrganizationInput (entities/organization.entity.ts).
 * No createdBy, role or status here: those are set by the server, never by the client.
 */
export const createOrganizationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "type"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 100, pattern: "\\S" },
    type: { type: "string", enum: [...ORGANIZATION_TYPES] },
    description: { type: "string", maxLength: 500 },
  },
} as const;
