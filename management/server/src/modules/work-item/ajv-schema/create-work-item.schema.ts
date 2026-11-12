import {
  MAX_ACCEPTANCE_CRITERIA,
  MAX_ASSIGNEES,
  MAX_CRITERION_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_ESTIMATE_HOURS,
  MAX_LABEL_LENGTH,
  MAX_LABELS,
  MAX_STORY_POINTS,
  MAX_TITLE_LENGTH,
  WORK_ITEM_CREATED_VIA,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_TYPES,
} from "../entities/work-item.entity";

/**
 * Validates CreateWorkItemInput (entities/work-item.entity.ts).
 * null is allowed on optional fields the client may send empty (parent, dates, estimates).
 * Rules that need the database (hierarchy, assignees) are checked in the service.
 */
export const createWorkItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["organizationId", "projectId", "type", "title"],
  properties: {
    organizationId: { type: "string", format: "objectId" },
    projectId: { type: "string", format: "objectId" },
    type: { type: "string", enum: [...WORK_ITEM_TYPES] },
    title: { type: "string", minLength: 1, maxLength: MAX_TITLE_LENGTH, pattern: "\\S" },
    description: { type: "string", maxLength: MAX_DESCRIPTION_LENGTH },
    statusId: { type: "string", format: "objectId", nullable: true },
    priority: { type: "string", enum: [...WORK_ITEM_PRIORITIES] },
    assigneeIds: {
      type: "array",
      maxItems: MAX_ASSIGNEES,
      uniqueItems: true,
      items: { type: "string", format: "objectId" },
    },
    parentId: { type: "string", format: "objectId", nullable: true },
    sprintId: { type: "string", format: "objectId", nullable: true },
    labels: {
      type: "array",
      maxItems: MAX_LABELS,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: MAX_LABEL_LENGTH, pattern: "\\S" },
    },
    startDate: { type: "string", format: "date", nullable: true },
    dueDate: { type: "string", format: "date", nullable: true },
    estimateHours: { type: "number", exclusiveMinimum: 0, maximum: MAX_ESTIMATE_HOURS, nullable: true },
    storyPoints: { type: "number", minimum: 0, maximum: MAX_STORY_POINTS, nullable: true },
    acceptanceCriteria: {
      type: "array",
      maxItems: MAX_ACCEPTANCE_CRITERIA,
      items: { type: "string", maxLength: MAX_CRITERION_LENGTH },
    },
    createdVia: { type: "string", enum: [...WORK_ITEM_CREATED_VIA] },
    aiGenerated: { type: "boolean" },
  },
} as const;
