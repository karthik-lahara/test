import { MAX_STATUSES_PER_PROJECT, MAX_STATUS_NAME_LENGTH, STATUS_CATEGORIES, STATUS_COLOR_PATTERN } from "../entities/work-item-status.entity";

const name = { type: "string", minLength: 1, maxLength: MAX_STATUS_NAME_LENGTH, pattern: "\\S" } as const;
const category = { type: "string", enum: [...STATUS_CATEGORIES] } as const;
const color = { type: "string", pattern: STATUS_COLOR_PATTERN } as const;

/** Validates CreateStatusInput (entities/work-item-status.entity.ts) */
export const createStatusSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category"],
  properties: { name, category, color, isDefault: { type: "boolean" } },
} as const;

/** Validates UpdateStatusInput. isDefault only accepts true. */
export const updateStatusSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { name, category, color, isDefault: { const: true } },
} as const;

/** Validates ReorderStatusesInput */
export const reorderStatusesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["statusIds"],
  properties: {
    statusIds: {
      type: "array",
      minItems: 1,
      maxItems: MAX_STATUSES_PER_PROJECT,
      uniqueItems: true,
      items: { type: "string", format: "objectId" },
    },
  },
} as const;

/** Validates DeleteStatusQuery */
export const deleteStatusQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: { moveToStatusId: { type: "string", format: "objectId" } },
} as const;

/** Validates StatusParams */
export const statusParamsSchema = {
  type: "object",
  required: ["statusId"],
  properties: { statusId: { type: "string", format: "objectId" } },
} as const;
