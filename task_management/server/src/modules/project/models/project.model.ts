import { Schema, model } from "mongoose";
import { IProject, PROJECT_PRIORITIES, PROJECT_STATUSES } from "../entities/project.entity";

const projectSchema = new Schema<IProject>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    key: { type: String, required: true, trim: true, uppercase: true, maxlength: 6 },
    summary: { type: String, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: PROJECT_STATUSES, default: "planning" },
    priority: { type: String, enum: PROJECT_PRIORITIES, default: "medium" },
    leadId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    startDate: { type: Date },
    targetDate: { type: Date },
    color: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    workItemCounter: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

// A key can be used only once inside an organization (archived projects keep theirs reserved).
// Starts with organizationId, so it also serves "all projects of organization X".
projectSchema.index({ organizationId: 1, key: 1 }, { unique: true });
// Project list: non-archived projects of an organization, newest first
projectSchema.index({ organizationId: 1, isArchived: 1, createdAt: -1 });

export const ProjectModel = model<IProject>("Project", projectSchema);
