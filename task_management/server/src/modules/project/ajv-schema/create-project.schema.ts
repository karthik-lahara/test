import {
  MAX_INITIAL_MEMBERS,
  PROJECT_COLOR_PATTERN,
  PROJECT_KEY_PATTERN,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
} from "../entities/project.entity";


export const createProjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "key"],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 100, pattern: "\\S" },
    key: { type: "string", pattern: PROJECT_KEY_PATTERN },
    summary: { type: "string", maxLength: 150 },
    description: { type: "string", maxLength: 500 },
    status: { type: "string", enum: [...PROJECT_STATUSES] },
    priority: { type: "string", enum: [...PROJECT_PRIORITIES] },
    leadId: { type: "string", format: "objectId" },
    startDate: { type: "string", format: "date" },
    targetDate: { type: "string", format: "date" },
    memberIds: {
      type: "array",
      maxItems: MAX_INITIAL_MEMBERS,
      uniqueItems: true,
      items: { type: "string", format: "objectId" },
    },
    color: { type: "string", pattern: PROJECT_COLOR_PATTERN },
  },
} as const;
