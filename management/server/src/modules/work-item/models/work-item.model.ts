import { Schema, model } from "mongoose";
import { STATUS_CATEGORIES } from "@modules/work-item-status/entities/work-item-status.entity";
import {
  IAcceptanceCriterion,
  IWorkItem,
  IWorkItemAttachment,
  MAX_CRITERION_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  WORK_ITEM_CREATED_VIA,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_TYPES,
} from "../entities/work-item.entity";

const acceptanceCriterionSchema = new Schema<IAcceptanceCriterion>({
  text: { type: String, required: true, trim: true, maxlength: MAX_CRITERION_LENGTH },
  done: { type: Boolean, default: false },
});

const attachmentSchema = new Schema<IWorkItemAttachment>({
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  fileUrl: { type: String, required: true, trim: true },
});

const workItemSchema = new Schema<IWorkItem>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    number: { type: Number, required: true, min: 1 },
    key: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: WORK_ITEM_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: MAX_TITLE_LENGTH },
    description: { type: String, trim: true, maxlength: MAX_DESCRIPTION_LENGTH },
    acceptanceCriteria: { type: [acceptanceCriterionSchema], default: [] },
    statusId: { type: Schema.Types.ObjectId, ref: "WorkItemStatus", required: true },
    statusCategory: { type: String, enum: STATUS_CATEGORIES, required: true },
    priority: { type: String, enum: WORK_ITEM_PRIORITIES, default: "medium" },
    assigneeIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "WorkItem" },
    sprintId: { type: Schema.Types.ObjectId, ref: "Sprint" },
    labels: { type: [String], default: [] },
    startDate: { type: Date },
    dueDate: { type: Date },
    estimateHours: { type: Number, min: 0 },
    loggedHours: { type: Number, default: 0, min: 0 },
    storyPoints: { type: Number, min: 0 },
    createdVia: { type: String, enum: WORK_ITEM_CREATED_VIA, default: "manual" },
    aiGenerated: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
    order: { type: Number, required: true },
    completedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// One number per project (PAY-12 exists once); also serves "all items of project X"
workItemSchema.index({ projectId: 1, number: 1 }, { unique: true });
// Open by key ("PAY-12") inside an organization
workItemSchema.index({ organizationId: 1, key: 1 }, { unique: true });
// Children of an item (hierarchy tree, progress)
workItemSchema.index({ parentId: 1 });
// Backlog and board: a project's items in order, without archived ones
workItemSchema.index({ projectId: 1, isArchived: 1, order: 1 });
// A sprint's items
workItemSchema.index({ sprintId: 1 });
// "My work": a user's open or done items
workItemSchema.index({ organizationId: 1, assigneeIds: 1, statusCategory: 1 });
// Items in a status (counts, moving them when the status is deleted)
workItemSchema.index({ statusId: 1 });

export const WorkItemModel = model<IWorkItem>("WorkItem", workItemSchema);
