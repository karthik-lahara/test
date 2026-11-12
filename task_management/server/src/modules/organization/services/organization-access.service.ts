import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { BadRequestError, ForbiddenError, NotFoundError } from "@utils/errors";
import { organizationParamsSchema } from "../ajv-schema/organization-params.schema";
import { OrganizationAccess, OrganizationParams } from "../entities/organization.entity";
import {
  IOrganizationMember,
  ORGANIZATION_PERMISSIONS,
  OrganizationPermission,
  OrganizationRole,
} from "../entities/organization-member.entity";
import { OrganizationRepository } from "../repositories/organization.repository";

/**
 * The one reusable "is this user allowed in this organization?" check.
 * Used by every route that works on a specific organization (update, delete, dashboard, projects...).
 *
 * @example
 * const { organization, membership } = await access.getMemberAccess(organizationId, userId);
 * access.assertPermission(membership, "organization:update");
 */
export class OrganizationAccessService {
  private repository = new OrganizationRepository();

  /**
   * 1. organizationId must be a valid ObjectId           -> 400
   * 2. organization must exist and be active             -> 404
   * 3. user must have an active membership in it         -> 403
   * The role always comes from the database, never from the request.
   */
  public async getMemberAccess(organizationId: string, userId: string): Promise<OrganizationAccess> {
    validateWithSchema<OrganizationParams>(organizationParamsSchema, { organizationId });
    const orgId = new Types.ObjectId(organizationId);

    const [organization, membership] = await Promise.all([
      this.repository.findActiveOrganizationById(orgId),
      this.repository.findActiveMembership(orgId, new Types.ObjectId(userId)),
    ]);

    if (!organization) throw new NotFoundError("Organization not found");
    if (!membership) throw new ForbiddenError("You are not a member of this organization");

    return { organization, membership };
  }

  /**
   * Every user in the list must be an active member of the organization -> otherwise 400.
   * Used before adding people to a project: you can only add colleagues, never outsiders.
   */
  public async assertAllActiveMembers(
    organizationId: Types.ObjectId,
    userIds: Types.ObjectId[],
    message = "Lead and members must be active members of this organization"
  ): Promise<void> {
    if (userIds.length === 0) return;
    const count = await this.repository.countActiveMembers(organizationId, userIds);
    if (count !== userIds.length) {
      throw new BadRequestError(message);
    }
  }

  /** true/false version of assertPermission, for "show more or less" decisions */
  public hasPermission(membership: IOrganizationMember, permission: OrganizationPermission): boolean {
    const allowedRoles: readonly OrganizationRole[] = ORGANIZATION_PERMISSIONS[permission];
    return allowedRoles.includes(membership.role);
  }

  public assertPermission(membership: IOrganizationMember, permission: OrganizationPermission): void {
    if (!this.hasPermission(membership, permission)) {
      throw new ForbiddenError("You do not have permission to perform this action");
    }
  }
}
