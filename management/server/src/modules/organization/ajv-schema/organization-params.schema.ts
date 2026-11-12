/** Validates OrganizationParams (entities/organization.entity.ts). Rejects anything that is not a 24-char ObjectId. */
export const organizationParamsSchema = {
  type: "object",
  required: ["organizationId"],
  properties: {
    organizationId: { type: "string", format: "objectId" },
  },
} as const;
