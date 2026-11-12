import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { AuthorizeError, NotFoundError } from "@utils/errors";
import { createOrganizationSchema } from "../ajv-schema/create-organization.schema";
import { updateOrganizationSchema } from "../ajv-schema/update-organization.schema";
import { listMembersQuerySchema } from "../ajv-schema/list-members-query.schema";
import { buildPagination, DEFAULT_PAGE_LIMIT, getSkip } from "@utils/pagination";
import {
  IOrganization,
  CreateOrganizationInput,
  CreateOrganizationResult,
  ListOrganizationMembersQuery,
  ListOrganizationMembersResult,
  MembershipResponse,
  MyOrganizationsResult,
  OnboardingStatus,
  OrganizationResponse,
  UpdateOrganizationInput,
  UserOrganization,
} from "../entities/organization.entity";
import { IOrganizationMember } from "../entities/organization-member.entity";
import { OrganizationRepository } from "../repositories/organization.repository";
import { OrganizationAccessService } from "./organization-access.service";

const toOrganizationResponse = (org: IOrganization): OrganizationResponse => ({
  id: org._id.toString(),
  name: org.name,
  type: org.type,
  description: org.description,
  status: org.status,
  createdBy: org.createdBy.toString(),
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
});

const toMembershipResponse = (m: Pick<IOrganizationMember, "_id" | "role" | "status" | "joinedAt">): MembershipResponse => ({
  id: m._id.toString(),
  role: m.role,
  status: m.status,
  joinedAt: m.joinedAt,
});

const getOnboardingStatus = (count: number): OnboardingStatus => {
  if (count === 0) return "NO_ORGANIZATION";
  if (count === 1) return "SINGLE_ORGANIZATION";
  return "MULTIPLE_ORGANIZATIONS";
};

export class OrganizationService {
  private repository = new OrganizationRepository();
  private access = new OrganizationAccessService();

  /**
   * Creates a personal or work organization and makes the creator its organization_admin.
   * @param userId comes from the access token (req.user), never from the request body
   */
  public async createOrganization(userId: string, body: unknown): Promise<CreateOrganizationResult> {
    const input = validateWithSchema<CreateOrganizationInput>(createOrganizationSchema, body);
    const creatorId = new Types.ObjectId(userId);
    const description = input.description?.trim() || undefined;

    // Save 1: the organization
    const organization = await this.repository.createOrganization({
      name: input.name.trim(),
      type: input.type,
      description,
      createdBy: creatorId,
    });

    // Save 2: the creator's admin membership. If it fails, undo save 1 so no organization is left without an admin.
    try {
      const membership = await this.repository.createMembership({
        organizationId: organization._id,
        userId: creatorId,
        role: "organization_admin",
      });

      return {
        organization: toOrganizationResponse(organization),
        membership: toMembershipResponse(membership),
      };
    } catch (err) {
      await this.repository.deleteOrganization(organization._id);
      throw err;
    }
  }

  /**
   * The logged-in user's active organizations with their role in each, plus an onboarding status.
   * Only the token's user is used, so a user can never list someone else's organizations.
   */
  public async getMyOrganizations(userId: string): Promise<MyOrganizationsResult> {
    const id = new Types.ObjectId(userId);

    const [user, rows] = await Promise.all([
      this.repository.findUserById(id),
      this.repository.findActiveMembershipsWithOrganization(id),
    ]);

    if (!user) throw new AuthorizeError("User not found");

    return {
      user: { id: user._id.toString(), fullName: user.fullName, email: user.email },
      onboarding: { status: getOnboardingStatus(rows.length) },
      organizations: rows.map((row) => ({
        organization: toOrganizationResponse(row.organization),
        membership: toMembershipResponse(row),
      })),
    };
  }

  /** Changes name and/or description. Only organization_admin. */
  public async updateOrganization(organizationId: string, userId: string, body: unknown): Promise<UserOrganization> {
    const { organization, membership } = await this.access.getMemberAccess(organizationId, userId);
    this.access.assertPermission(membership, "organization:update");

    const input = validateWithSchema<UpdateOrganizationInput>(updateOrganizationSchema, body);

    const set: { name?: string; description?: string } = {};
    const unset: { description?: 1 } = {};
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.description !== undefined) {
      const description = input.description.trim();
      if (description) set.description = description;
      else unset.description = 1;
    }

    const updated = await this.repository.updateOrganization(organization._id, set, unset);
    // Archived by another request between the access check and the update
    if (!updated) throw new NotFoundError("Organization not found");

    return { organization: toOrganizationResponse(updated), membership: toMembershipResponse(membership) };
  }

  /** Soft delete: the organization is archived, not erased. Only organization_admin. */
  public async deleteOrganization(organizationId: string, userId: string): Promise<void> {
    const { organization, membership } = await this.access.getMemberAccess(organizationId, userId);
    this.access.assertPermission(membership, "organization:delete");

    const archived = await this.repository.archiveOrganization(organization._id, membership.userId);
    if (!archived) throw new NotFoundError("Organization not found");
  }

  /**
   * People in an organization, one page at a time, A-Z by name.
   * Allowed: any active member of the organization (colleagues can see each other).
   */
  public async listMembers(
    organizationId: string,
    userId: string,
    rawQuery: unknown
  ): Promise<ListOrganizationMembersResult> {
    const access = await this.access.getMemberAccess(organizationId, userId);

    const queryCopy = { ...(rawQuery as object) };
    const query = validateWithSchema<ListOrganizationMembersQuery>(listMembersQuerySchema, queryCopy);

    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const search = query.search?.trim() || undefined;

    const result = await this.repository.listMembers({
      organizationId: access.organization._id,
      role: query.role,
      search: search,
      skip: getSkip(page, limit),
      limit: limit,
    });

    const members = result.items.map((row) => {
      return {
        userId: row.userId.toString(),
        fullName: row.user.fullName,
        email: row.user.email,
        role: row.role,
        joinedAt: row.joinedAt,
      };
    });

    return { members: members, pagination: buildPagination(page, limit, result.total) };
  }
}
