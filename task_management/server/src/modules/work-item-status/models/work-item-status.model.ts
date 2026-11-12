import { Schema, model } from "mongoose";
import { IWorkItemStatus, MAX_STATUS_NAME_LENGTH, STATUS_CATEGORIES } from "../entities/work-item-status.entity";

const workItemStatusSchema = new Schema<IWorkItemStatus>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true, trim: true, maxlength: MAX_STATUS_NAME_LENGTH },
    nameKey: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String, enum: STATUS_CATEGORIES, required: true },
    color: { type: String, required: true, uppercase: true, trim: true },
    order: { type: Number, required: true },
    isDefault: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

// One active status per name in a project (a deleted name can be used again)
workItemStatusSchema.index(
  { projectId: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);
// A project's statuses in board order
workItemStatusSchema.index({ projectId: 1, isArchived: 1, order: 1 });

export const WorkItemStatusModel = model<IWorkItemStatus>("WorkItemStatus", workItemStatusSchema);
