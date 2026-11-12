/** Validates ProjectParams (entities/project.entity.ts). projectId must be a 24-char ObjectId. */
export const projectParamsSchema = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", format: "objectId" },
  },
} as const;
