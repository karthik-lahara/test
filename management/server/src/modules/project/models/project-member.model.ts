import { Schema, model } from "mongoose";
import { IProjectMember, PROJECT_MEMBER_STATUSES, PROJECT_ROLES } from "../entities/project-member.entity";

const projectMemberSchema = new Schema<IProjectMember>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: PROJECT_ROLES, required: true },
    status: { type: String, enum: PROJECT_MEMBER_STATUSES, default: "active" },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

// A user can be in a project only once (also used for "is this user in project X?")
projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
// "Which projects am I in, inside organization X?" (project list, dashboard)
projectMemberSchema.index({ organizationId: 1, userId: 1, status: 1 });

export const ProjectMemberModel = model<IProjectMember>("ProjectMember", projectMemberSchema);
