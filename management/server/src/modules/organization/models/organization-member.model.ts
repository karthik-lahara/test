import { Schema, model } from "mongoose";
import {
  IOrganizationMember,
  ORGANIZATION_MEMBER_STATUSES,
  ORGANIZATION_ROLES,
} from "../entities/organization-member.entity";

const organizationMemberSchema = new Schema<IOrganizationMember>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ORGANIZATION_ROLES, required: true },
    status: { type: String, enum: ORGANIZATION_MEMBER_STATUSES, default: "active" },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

// A user can be in an organization only once (also used for "is this user a member of org X?")
organizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
// "Which organizations does this user belong to?" (login / organization selector)
organizationMemberSchema.index({ userId: 1, status: 1 });

export const OrganizationMemberModel = model<IOrganizationMember>("OrganizationMember", organizationMemberSchema);
