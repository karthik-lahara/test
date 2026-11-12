import { PipelineStage, Types } from "mongoose";
import { UserModel } from "@modules/auth/models/user.model";
import { IUser } from "@modules/auth/entities/user.entity";
import { OrganizationModel } from "../models/organization.model";
import { OrganizationMemberModel } from "../models/organization-member.model";
import { escapeRegex } from "@utils/escape-regex";
import {
  IOrganization,
  CreateOrganizationData,
  CreateOrganizationMemberData,
  ListOrganizationMembersFilter,
  MembershipWithOrganization,
  OrganizationMemberWithUser,
} from "../entities/organization.entity";
import { IOrganizationMember } from "../entities/organization-member.entity";

/** All database access of the organization module */
export class OrganizationRepository {
  // ---- Members list ----

  /**
   * One page of an organization's active members with name and email, A-Z by name.
   * One round trip ($facet: the page + the total).
   */
  public async listMembers(
    filter: ListOrganizationMembersFilter
  ): Promise<{ items: OrganizationMemberWithUser[]; total: number }> {
    // 1. Which memberships (uses the { organizationId, userId } index)
    const membershipMatch: Record<string, unknown> = { organizationId: filter.organizationId, status: "active" };
    if (filter.role) {
      membershipMatch.role = filter.role;
    }

    // 3. Search on the joined user's name or email
    const searchMatch: Record<string, unknown> = {};
    if (filter.search) {
      const text = new RegExp(escapeRegex(filter.search), "i");
      searchMatch.$or = [{ "user.fullName": text }, { "user.email": text }];
    }

    const pipeline: PipelineStage[] = [
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
      // 4. A-Z by name (_id breaks ties so pages never overlap)
      { $sort: { "user.fullName": 1, _id: 1 } },
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
    ];

    type FacetResult = { items: OrganizationMemberWithUser[]; total: { count: number }[] };
    const [result] = await OrganizationMemberModel.aggregate<FacetResult>(pipeline).collation({
      locale: "en",
      strength: 2,
    });

    const total = result.total[0]?.count ?? 0;
    return { items: result.items, total };
  }

  // ---- Users ----

  public async findUserById(id: Types.ObjectId): Promise<Pick<IUser, "_id" | "fullName" | "email"> | null> {
    return UserModel.findById(id).select("fullName email").lean();
  }

  // ---- Organizations ----

  public async createOrganization(data: CreateOrganizationData): Promise<IOrganization> {
    const organization = await OrganizationModel.create(data);
    return organization.toObject();
  }

  /** Used to undo a creation when the creator's membership could not be saved */
  public async deleteOrganization(id: Types.ObjectId): Promise<void> {
    await OrganizationModel.deleteOne({ _id: id });
  }

  /** null when the organization does not exist or is archived */
  public async findActiveOrganizationById(id: Types.ObjectId): Promise<IOrganization | null> {
    return OrganizationModel.findOne({ _id: id, status: "active" }).lean<IOrganization>();
  }

  /**
   * Updates an active organization and returns the new version.
   * null when it was archived meanwhile.
   */
  public async updateOrganization(
    id: Types.ObjectId,
    set: Partial<Pick<IOrganization, "name" | "description">>,
    unset: Partial<Record<"description", 1>>
  ): Promise<IOrganization | null> {
    const update: Record<string, object> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;

    return OrganizationModel.findOneAndUpdate({ _id: id, status: "active" }, update, {
      returnDocument: "after",
      runValidators: true,
    }).lean<IOrganization>();
  }

  /** Soft delete. Returns false when it was already archived. */
  public async archiveOrganization(id: Types.ObjectId, archivedBy: Types.ObjectId): Promise<boolean> {
    const result = await OrganizationModel.updateOne(
      { _id: id, status: "active" },
      { $set: { status: "archived", archivedAt: new Date(), archivedBy } }
    );
    return result.modifiedCount === 1;
  }

  // ---- Memberships ----

  public async createMembership(data: CreateOrganizationMemberData): Promise<IOrganizationMember> {
    const membership = await OrganizationMemberModel.create(data);
    return membership.toObject();
  }

  /** How many of these users are active members of the organization (one query for the whole list) */
  public async countActiveMembers(organizationId: Types.ObjectId, userIds: Types.ObjectId[]): Promise<number> {
    return OrganizationMemberModel.countDocuments({ organizationId, userId: { $in: userIds }, status: "active" });
  }

  /** The user's active membership in this organization (uses the unique { organizationId, userId } index) */
  public async findActiveMembership(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<IOrganizationMember | null> {
    return OrganizationMemberModel.findOne({ organizationId, userId, status: "active" }).lean<IOrganizationMember>();
  }

  /**
   * The user's active memberships, each with its (active) organization attached, sorted by organization name.
   * One round trip: MongoDB does the join, filter and sort.
   */
  public async findActiveMembershipsWithOrganization(userId: Types.ObjectId): Promise<MembershipWithOrganization[]> {
    return OrganizationMemberModel.aggregate<MembershipWithOrganization>([
      // 1. Only this user's active memberships (uses the { userId, status } index)
      { $match: { userId, status: "active" } },

      // 2. Join: attach the organization each membership points to (uses the _id index of organizations)
      {
        $lookup: {
          from: OrganizationModel.collection.name, // "organizations"
          localField: "organizationId",
          foreignField: "_id",
          as: "organization",
          // Only active organizations are attached; archived ones produce an empty array
          pipeline: [{ $match: { status: "active" } }],
        },
      },

      // 3. $lookup always gives an array: turn [org] into org. Empty arrays (archived org) are dropped here.
      { $unwind: "$organization" },

      // 4. A-Z by organization name (the collation below makes it case-insensitive)
      { $sort: { "organization.name": 1 } },

      // 5. Send back only what the service needs
      { $project: { _id: 1, role: 1, status: 1, joinedAt: 1, organization: 1 } },
    ]).collation({ locale: "en", strength: 2 });
  }
}
