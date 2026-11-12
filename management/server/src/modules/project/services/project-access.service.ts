import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { ForbiddenError, NotFoundError } from "@utils/errors";
import { OrganizationAccessService } from "@modules/organization/services/organization-access.service";
import {
  IOrganizationMember,
  OrganizationRole,
} from "@modules/organization/entities/organization-member.entity";
import { projectParamsSchema } from "../ajv-schema/project-params.schema";
import { IProject, ProjectAccess, ProjectParams } from "../entities/project.entity";
import { PROJECT_PERMISSIONS, ProjectPermission, ProjectRole } from "../entities/project-member.entity";
import { ProjectRepository } from "../repositories/project.repository";

/**
 * The one reusable "is this user allowed to do this on this project?" check.
 * Used by every route that works on one project (update, delete, and later tasks, members...).
 *
 * @example
 * const access = await this.projectAccess.getProjectAccess(projectId, userId);
 * this.projectAccess.assertProjectPermission(access, "project:update");
 */
export class ProjectAccessService {
  private projectRepository = new ProjectRepository();
  private organizationAccess = new OrganizationAccessService();

  /**
   * 1. projectId must be a valid ObjectId                         -> 400
   * 2. project must exist and not be archived                     -> 404
   * 3. user must be an active member of the project's organization -> 404 (outsiders can't learn it exists)
   * 4. load the user's project role (null if not in the project)
   */
  public async getProjectAccess(projectId: string, userId: string): Promise<ProjectAccess> {
    validateWithSchema<ProjectParams>(projectParamsSchema, { projectId });
    const projectObjectId = new Types.ObjectId(projectId);
    const userObjectId = new Types.ObjectId(userId);

    // Both lookups only need the ids, so run them at the same time
    const [project, projectMembership] = await Promise.all([
      this.projectRepository.findActiveProjectById(projectObjectId),
      this.projectRepository.findActiveProjectMembership(projectObjectId, userObjectId),
    ]);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const organizationMembership = await this.findOrganizationMembership(project, userId);
    if (!organizationMembership) {
      throw new NotFoundError("Project not found");
    }

    return { project, organizationMembership, projectMembership };
  }

  /**
   * 5. allowed if the user's organization role OR project role is listed for this action -> otherwise 403
   */
  public assertProjectPermission(access: ProjectAccess, permission: ProjectPermission): void {
    const rule = PROJECT_PERMISSIONS[permission];

    const allowedOrganizationRoles: readonly OrganizationRole[] = rule.organizationRoles;
    const hasAllowedOrganizationRole = allowedOrganizationRoles.includes(access.organizationMembership.role);

    const allowedProjectRoles: readonly ProjectRole[] = rule.projectRoles;
    let hasAllowedProjectRole = false;
    if (access.projectMembership) {
      hasAllowedProjectRole = allowedProjectRoles.includes(access.projectMembership.role);
    }

    if (!hasAllowedOrganizationRole && !hasAllowedProjectRole) {
      throw new ForbiddenError("You do not have permission to perform this action");
    }
  }

  /** The user's active membership in the project's organization, or null (not a member / org archived) */
  private async findOrganizationMembership(project: IProject, userId: string): Promise<IOrganizationMember | null> {
    const organizationId = project.organizationId.toString();

    try {
      const organizationAccess = await this.organizationAccess.getMemberAccess(organizationId, userId);
      return organizationAccess.membership;
    } catch (error) {
      const isNotMemberOrNoOrganization = error instanceof ForbiddenError || error instanceof NotFoundError;
      if (isNotMemberOrNoOrganization) {
        return null;
      }
      throw error;
    }
  }
}
