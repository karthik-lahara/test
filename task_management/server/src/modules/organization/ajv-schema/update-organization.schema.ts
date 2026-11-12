/**
 * Validates UpdateOrganizationInput (entities/organization.entity.ts).
 * Only name and description can be changed. type, status, createdBy and roles are rejected.
 */
export const updateOrganizationSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: "string", minLength: 2, maxLength: 100, pattern: "\\S" },
    // "" is allowed: it clears the description
    description: { type: "string", maxLength: 500 },
  },
} as const;
