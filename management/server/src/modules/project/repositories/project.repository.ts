import { Types } from "mongoose";
import { escapeRegex } from "@utils/escape-regex";
import { UserModel } from "@modules/auth/models/user.model";
import { IUser } from "@modules/auth/entities/user.entity";
import { ProjectModel } from "../models/project.model";
import { ProjectMemberModel } from "../models/project-member.model";
import {
  IProject,
  CreateProjectData,
  ListProjectMembersFilter,
  ListProjectsFilter,
  ProjectListRow,
  ProjectChanges,
  ProjectMemberWithUser,
} from "../entities/project.entity";
import { IProjectMember, CreateProjectMemberData } from "../entities/project-member.entity";


/** All database access of the project module */
export class ProjectRepository {
  // ---- Projects ----

  public async createProject(data: CreateProjectData): Promise<IProject> {
    const project = await ProjectModel.create(data);
    return project.toObject();
  }

  /** Used to undo a creation when the project's members could not be saved */
  public async deleteProjectWithMembers(id: Types.ObjectId): Promise<void> {
    await ProjectMemberModel.deleteMany({ projectId: id });
    await ProjectModel.deleteOne({ _id: id });
  }

  /**
   * Updates a non-archived project and returns the new version.
   * Returns null if the project was archived in the meantime.
   */
  public async updateProject(projectId: Types.ObjectId, changes: ProjectChanges): Promise<IProject | null> {
    const update: Record<string, object> = {};

    if (Object.keys(changes.fieldsToSet).length > 0) {
      update.$set = changes.fieldsToSet;
    }

    if (changes.fieldsToRemove.length > 0) {
      const unset: Record<string, 1> = {};
      for (const field of changes.fieldsToRemove) {
        unset[field] = 1;
      }
      update.$unset = unset;
    }

    const filter = { _id: projectId, isArchived: false };
    const options = { returnDocument: "after" as const, runValidators: true };
    return ProjectModel.findOneAndUpdate(filter, update, options).lean<IProject>();
  }

  /** Soft delete. Returns false if the project was already archived. */
  public async archiveProject(projectId: Types.ObjectId, archivedBy: Types.ObjectId): Promise<boolean> {
    const filter = { _id: projectId, isArchived: false };
    const update = { $set: { isArchived: true, archivedAt: new Date(), archivedBy: archivedBy } };

    const result = await ProjectModel.updateOne(filter, update);
    return result.modifiedCount === 1;
  }

  /** A non-archived project by id (its organizationId comes with it) */
  public async findActiveProjectById(projectId: Types.ObjectId): Promise<IProject | null> {
    return ProjectModel.findOne({ _id: projectId, isArchived: false }).lean<IProject>();
  }

  /**
   * Reserves the next work item number of a project (1, 2, 3...) in one atomic step, so two
   * items created at the same time never get the same key. null if the project is archived.
   */
  public async nextWorkItemNumber(projectId: Types.ObjectId): Promise<number | null> {
    const project = await ProjectModel.findOneAndUpdate(
      { _id: projectId, isArchived: false },
      { $inc: { workItemCounter: 1 } },
      { returnDocument: "after" }
    )
      .select({ workItemCounter: 1 })
      .lean<Pick<IProject, "workItemCounter">>();
    return project?.workItemCounter ?? null;
  }

  /**
   * One page of projects, with the lead's name, active member count and the current user's role.
   * One round trip: $facet returns the page AND the total count together.
   */
  public async listProjects(filter: ListProjectsFilter): Promise<{ items: ProjectListRow[]; total: number }> {
    const match: Record<string, unknown> = { organizationId: filter.organizationId, isArchived: false };
    if (filter.projectIds) match._id = { $in: filter.projectIds };
    if (filter.status) match.status = filter.status;
    if (filter.priority) match.priority = filter.priority;
    if (filter.search) {
      const text = new RegExp(escapeRegex(filter.search), "i");
      match.$or = [{ name: text }, { key: text }];
    }

    const [result] = await ProjectModel.aggregate<{ items: ProjectListRow[]; total: { count: number }[] }>([
      // 1. Only this organization's non-archived projects (+ filters). Uses { organizationId, isArchived, createdAt }.
      { $match: match },
      // 2. Newest first (_id breaks ties so pages never overlap)
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          // 3a. How many match in total (for pagination)
          total: [{ $count: "count" }],
          // 3b. Only the requested page, then join the extra info for those rows only
          items: [
            { $skip: filter.skip },
            { $limit: filter.limit },
            // Lead's name
            {
              $lookup: {
                from: UserModel.collection.name,
                localField: "leadId",
                foreignField: "_id",
                as: "lead",
                pipeline: [{ $project: { fullName: 1 } }],
              },
            },
            { $unwind: { path: "$lead", preserveNullAndEmptyArrays: true } },
            // Active members (uses the { projectId, userId } index)
            {
              $lookup: {
                from: ProjectMemberModel.collection.name,
                localField: "_id",
                foreignField: "projectId",
                as: "activeMembers",
                pipeline: [{ $match: { status: "active" } }, { $project: { userId: 1, role: 1 } }],
              },
            },
            // Member count + the current user's own membership, then drop the member list
            {
              $addFields: {
                memberCount: { $size: "$activeMembers" },
                myMembership: {
                  $first: { $filter: { input: "$activeMembers", cond: { $eq: ["$$this.userId", filter.userId] } } },
                },
              },
            },
            { $project: { activeMembers: 0, description: 0 } },
          ],
        },
      },
    ]);

    return { items: result.items, total: result.total[0]?.count ?? 0 };
  }

  // ---- Project members ----

  /** Saves several members in one database call (lead + picked members) */
  public async createProjectMembers(data: CreateProjectMemberData[]): Promise<IProjectMember[]> {
    const members = await ProjectMemberModel.insertMany(data);
    return members.map((m) => m.toObject());
  }

  /** Ids of the projects this user is an active member of, in one organization (uses { organizationId, userId, status }) */
  public async findMyProjectIds(organizationId: Types.ObjectId, userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    return ProjectMemberModel.distinct("projectId", { organizationId, userId, status: "active" });
  }

  /** The user's active membership in a project, or null */
  public async findActiveProjectMembership(
    projectId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<IProjectMember | null> {
    return ProjectMemberModel.findOne({ projectId, userId, status: "active" }).lean<IProjectMember>();
  }

  /**
   * One page of a project's active members with name and email.
   * project_manager first, then A-Z by name. One round trip ($facet: the page + the total).
   */
  public async listProjectMembers(
    filter: ListProjectMembersFilter
  ): Promise<{ items: ProjectMemberWithUser[]; total: number }> {

    const membershipMatch: Record<string, unknown> = { projectId: filter.projectId, status: "active" };
    if (filter.role) {
      membershipMatch.role = filter.role;
    }

    const searchMatch: Record<string, unknown> = {};
    if (filter.search) {
      const text = new RegExp(escapeRegex(filter.search), "i");
      searchMatch.$or = [{ "user.fullName": text }, { "user.email": text }];
    }

    const [result] = await ProjectMemberModel.aggregate<{ items: ProjectMemberWithUser[]; total: { count: number }[] }>([
      { $match: membershipMatch },
      // 2. Attach the user's name and email. A deleted user disappears from the list.
      {
        $lookup: {
          from: UserModel.collection.name,
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { _id: 0, fullName: 1, email: 1 } }],
        },
      },
      { $unwind: "$user" },
      { $match: searchMatch },
      // 4. "project_manager" > "member" alphabetically, so -1 puts managers first; then A-Z
      { $sort: { role: -1, "user.fullName": 1, _id: 1 } },
      {
        $facet: {
          total: [{ $count: "count" }],
          items: [
            { $skip: filter.skip },
            { $limit: filter.limit },
            { $project: { userId: 1, role: 1, joinedAt: 1, user: 1 } },
          ],
        },
      },
    ]).collation({ locale: "en", strength: 2 });

    const total = result.total[0]?.count ?? 0;
    return { items: result.items, total };
  }

  /** Active members of a project with name and email: project_manager first, then by join date */
  public async findProjectMembersWithUser(projectId: Types.ObjectId): Promise<ProjectMemberWithUser[]> {
    return ProjectMemberModel.aggregate<ProjectMemberWithUser>([
      { $match: { projectId, status: "active" } },
      {
        $lookup: {
          from: UserModel.collection.name,
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { _id: 0, fullName: 1, email: 1 } }],
        },
      },
      // A deleted user disappears from the list
      { $unwind: "$user" },
      // "project_manager" > "member" alphabetically, so -1 puts managers first
      { $sort: { role: -1, joinedAt: 1 } },
      { $project: { userId: 1, role: 1, joinedAt: 1, user: 1 } },
    ]);
  }

  // ---- Users ----

  public async findUserSummary(id: Types.ObjectId): Promise<Pick<IUser, "_id" | "fullName" | "email"> | null> {
    return UserModel.findById(id).select("fullName email").lean();
  }
}
