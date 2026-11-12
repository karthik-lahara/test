import { Schema, model } from "mongoose";
import { IOrganization, ORGANIZATION_STATUSES, ORGANIZATION_TYPES } from "../entities/organization.entity";

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: { type: String, enum: ORGANIZATION_TYPES, required: true },
    description: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ORGANIZATION_STATUSES, default: "active" },
    archivedAt: { type: Date },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false }
);

export const OrganizationModel = model<IOrganization>("Organization", organizationSchema);
