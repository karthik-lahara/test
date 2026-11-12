import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@utils/errors";
import { logger } from "@utils/logger";
import { OrganizationAccessService } from "@modules/organization/services/organization-access.service";
import { WorkItemStatusService } from "@modules/work-item-status/services/work-item-status.service";
import { createProjectSchema } from "../ajv-schema/create-project.schema";
import { listProjectsQuerySchema } from "../ajv-schema/list-projects-query.schema";
import { projectParamsSchema } from "../ajv-schema/project-params.schema";
import { updateProjectSchema } from "../ajv-schema/update-project.schema";
import { listProjectMembersQuerySchema } from "../ajv-schema/list-project-members-query.schema";
import { buildPagination, getSkip } from "@utils/pagination";
import { ProjectAccessService } from "./project-access.service";
import {
  IProject,
  CreateProjectInput,
  CreateProjectResult,
  DEFAULT_PAGE_LIMIT,
  ListProjectMembersQuery,
  ListProjectMembersResult,
  ListProjectsQuery,
  ListProjectsResult,
  ProjectDetailsResult,
  ProjectListRow,
  ProjectListItem,
  ProjectMemberResponse,
  ProjectParams,
  ProjectResponse,
  ProjectChanges,
  RemovableProjectField,
  UpdateProjectFields,
  UpdateProjectInput,
} from "../entities/project.entity";
import { IProjectMember, CreateProjectMemberData } from "../entities/project-member.entity";
import { ProjectRepository } from "../repositories/project.repository";

const toProjectResponse = (p: IProject): ProjectResponse => ({
  id: p._id.toString(),
  organizationId: p.organizationId.toString(),
  name: p.name,
  key: p.key,
  summary: p.summary,
  description: p.description,
  status: p.status,
  priority: p.priority,
  leadId: p.leadId.toString(),
  startDate: p.startDate,
  targetDate: p.targetDate,
  color: p.color,
  createdBy: p.createdBy.toString(),
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const toProjectMemberResponse = (m: IProjectMember): ProjectMemberResponse => ({
  id: m._id.toString(),
  userId: m.userId.toString(),
  role: m.role,
  status: m.status,
  joinedAt: m.joinedAt,
});

const toProjectListItem = (row: ProjectListRow): ProjectListItem => {
  // The list row has no description; reuse the shared mapper for every other field
  const { description: _description, ...base } = toProjectResponse({ ...row, description: undefined });
  return {
    ...base,
    lead: row.lead ? { id: row.lead._id.toString(), fullName: row.lead.fullName } : null,
    memberCount: row.memberCount,
    myRole: row.myMembership?.role ?? null,
  };
};

const clean = (value?: string): string | undefined => value?.trim() || undefined;

const isDuplicateKeyError = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

export class ProjectService {
  private repository = new ProjectRepository();
  private organizationAccess = new OrganizationAccessService();
  private projectAccess = new ProjectAccessService();
  private statusService = new WorkItemStatusService();

  /**
   * Creates a project in an organization. Only roles allowed "project:create" (organization_admin).
   * The lead (default: the creator) becomes project_manager; picked members become member.
   * @param organizationId from the URL, checked against the user's membership
   * @param userId from the access token, never from the body
   */
  public async createProject(organizationId: string, userId: string, body: unknown): Promise<CreateProjectResult> {
    const { organization, membership } = await this.organizationAccess.getMemberAccess(organizationId, userId);

    this.organizationAccess.assertPermission(membership, "project:create");

    const input = validateWithSchema<CreateProjectInput>(createProjectSchema, body);
    const key = input.key.toUpperCase();

    const startDate = input.startDate ? new Date(input.startDate) : undefined;
    const targetDate = input.targetDate ? new Date(input.targetDate) : undefined;
    if (startDate && targetDate && targetDate < startDate) {
      throw new BadRequestError("End date cannot be before the start date");
    }

    // Lead defaults to the creator. The lead is not also added as a plain member.
    const leadId = input.leadId ? new Types.ObjectId(input.leadId) : membership.userId;
    const memberIds = (input.memberIds ?? [])
      .filter((id) => id !== leadId.toString())
      .map((id) => new Types.ObjectId(id));

    // Only colleagues can be added: lead and members must be active members of this organization
    await this.organizationAccess.assertAllActiveMembers(organization._id, [leadId, ...memberIds]);

    // Save 1: the project
    let project: IProject;
    try {
      project = await this.repository.createProject({
        organizationId: organization._id,
        name: input.name.trim(),
        key,
        summary: clean(input.summary),
        description: clean(input.description),
        status: input.status ?? "planning",
        priority: input.priority ?? "medium",
        leadId,
        startDate,
        targetDate,
        color: input.color?.toUpperCase(),
        createdBy: membership.userId,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(`Project key "${key}" already exists in this organization`);
      }
      throw err;
    }

    // Save 2: lead + members in one call. If it fails, undo everything so no project is left without a manager.
    const rows: CreateProjectMemberData[] = [
      { organizationId: organization._id, projectId: project._id, userId: leadId, role: "project_manager" },
      ...memberIds.map((id) => ({
        organizationId: organization._id,
        projectId: project._id,
        userId: id,
        role: "member" as const,
      })),
    ];
    let members: IProjectMember[];
    try {
      members = await this.repository.createProjectMembers(rows);
    } catch (err) {
      await this.repository.deleteProjectWithMembers(project._id);
      throw err;
    }

    // Save 3: the default work item statuses (To Do ... Done). Not worth failing the project
    // over: if this fails, they are created the first time the project's statuses are needed.
    try {
      await this.statusService.ensureDefaultStatuses(project, userId);
    } catch (err) {
      logger.warn({ err, projectId: project._id.toString() }, "Default statuses not created; will retry on first use");
    }

    return { project: toProjectResponse(project), members: members.map(toProjectMemberResponse) };
  }

  /**
   * Projects of an organization, one page at a time.
   * Admin ("project:view_all"): every project. Member: only projects they belong to.
   */
  public async listProjects(organizationId: string, userId: string, rawQuery: unknown): Promise<ListProjectsResult> {
    const { organization, membership } = await this.organizationAccess.getMemberAccess(organizationId, userId);
    const query = validateWithSchema<ListProjectsQuery>(listProjectsQuerySchema, { ...(rawQuery as object) });

    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const emptyPage: ListProjectsResult = { projects: [], pagination: { page, limit, total: 0, totalPages: 0 } };

    // Members see only their own projects
    let projectIds: Types.ObjectId[] | undefined;
    if (!this.organizationAccess.hasPermission(membership, "project:view_all")) {
      projectIds = await this.repository.findMyProjectIds(organization._id, membership.userId);
      if (projectIds.length === 0) return emptyPage;
    }

    const { items, total } = await this.repository.listProjects({
      organizationId: organization._id,
      userId: membership.userId,
      projectIds,
      status: query.status,
      priority: query.priority,
      search: query.search?.trim() || undefined,
      skip: (page - 1) * limit,
      limit,
    });

    return {
      projects: items.map(toProjectListItem),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * One project with its lead and members. Only the project id is needed:
   * the organization is read from the project document, never from the request.
   * 404: project missing/archived, its organization archived, or the user is outside that organization
   *      (an outsider can't even learn the project exists). 403: org member who is not in the project.
   */
  public async getProject(projectId: string, userId: string): Promise<ProjectDetailsResult> {
    validateWithSchema<ProjectParams>(projectParamsSchema, { projectId });
    const projectObjectId = new Types.ObjectId(projectId);

    const [project, myProjectMembership] = await Promise.all([
      this.repository.findActiveProjectById(projectObjectId),
      this.repository.findActiveProjectMembership(projectObjectId, new Types.ObjectId(userId)),
    ]);
    if (!project) throw new NotFoundError("Project not found");

    // The organization comes from the project. Not a member of it -> 404, same as "doesn't exist".
    let membership;
    try {
      ({ membership } = await this.organizationAccess.getMemberAccess(project.organizationId.toString(), userId));
    } catch (err) {
      if (err instanceof ForbiddenError || err instanceof NotFoundError) throw new NotFoundError("Project not found");
      throw err;
    }

    const canViewAll = this.organizationAccess.hasPermission(membership, "project:view_all");
    if (!canViewAll && !myProjectMembership) {
      throw new ForbiddenError("You are not a member of this project");
    }

    const [members, lead] = await Promise.all([
      this.repository.findProjectMembersWithUser(project._id),
      this.repository.findUserSummary(project.leadId),
    ]);

    return {
      project: {
        ...toProjectResponse(project),
        lead: lead ? { id: lead._id.toString(), fullName: lead.fullName, email: lead.email } : null,
      },
      members: members.map((m) => ({
        userId: m.userId.toString(),
        fullName: m.user.fullName,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      access: { organizationRole: membership.role, projectRole: myProjectMembership?.role ?? null },
    };
  }

  /**
   * Changes a project's details. Allowed: organization admin, or this project's project manager.
   * Only the sent fields change. key, lead and members are never changed here.
   */
  public async updateProject(projectId: string, userId: string, body: unknown): Promise<ProjectResponse> {
    const access = await this.projectAccess.getProjectAccess(projectId, userId);
    this.projectAccess.assertProjectPermission(access, "project:update");

    const input = validateWithSchema<UpdateProjectInput>(updateProjectSchema, body);
    checkDateOrder(input, access.project);

    const changes = buildProjectChanges(input);
    const updatedProject = await this.repository.updateProject(access.project._id, changes);

    // Archived by another request between the access check and the update
    if (!updatedProject) {
      throw new NotFoundError("Project not found");
    }

    return toProjectResponse(updatedProject);
  }

  /**
   * Soft delete: the project is archived, not erased. Its key stays reserved.
   * Allowed: organization admin only.
   */
  public async deleteProject(projectId: string, userId: string): Promise<void> {
    const access = await this.projectAccess.getProjectAccess(projectId, userId);
    this.projectAccess.assertProjectPermission(access, "project:delete");

    const archivedBy = access.organizationMembership.userId;
    const wasArchived = await this.repository.archiveProject(access.project._id, archivedBy);

    // Archived by another request in the meantime
    if (!wasArchived) {
      throw new NotFoundError("Project not found");
    }
  }

  /**
   * People in a project, one page at a time. project_manager first, then A-Z.
   * Allowed: organization admin, or anyone in the project.
   */
  public async listProjectMembers(
    projectId: string,
    userId: string,
    rawQuery: unknown
  ): Promise<ListProjectMembersResult> {
    const access = await this.projectAccess.getProjectAccess(projectId, userId);
    this.projectAccess.assertProjectPermission(access, "project:view_members");

    const queryCopy = { ...(rawQuery as object) };
    const query = validateWithSchema<ListProjectMembersQuery>(listProjectMembersQuerySchema, queryCopy);

    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const search = query.search?.trim() || undefined;

    const result = await this.repository.listProjectMembers({
      projectId: access.project._id,
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

// ---- Helpers for updateProject ----

/**
 * Turns the update request into two lists:
 * fieldsToSet (new values) and fieldsToRemove (sent as "" or null).
 * Fields that were not sent are left out, so they don't change.
 */
function buildProjectChanges(input: UpdateProjectInput): ProjectChanges {
  const changes: ProjectChanges = { fieldsToSet: {}, fieldsToRemove: [] };

  // Required fields: can be changed, never removed
  if (input.name !== undefined) {
    changes.fieldsToSet.name = input.name.trim();
  }
  if (input.status !== undefined) {
    changes.fieldsToSet.status = input.status;
  }
  if (input.priority !== undefined) {
    changes.fieldsToSet.priority = input.priority;
  }

  // Optional fields: can be changed or removed
  addOptionalField(changes, "summary", toTextOrNull(input.summary));
  addOptionalField(changes, "description", toTextOrNull(input.description));
  addOptionalField(changes, "startDate", toDateOrNull(input.startDate));
  addOptionalField(changes, "targetDate", toDateOrNull(input.targetDate));
  addOptionalField(changes, "color", toColorOrNull(input.color));

  return changes;
}

/** undefined = not sent (no change), null = remove the field, anything else = set it */
function addOptionalField<Field extends RemovableProjectField>(
  changes: ProjectChanges,
  field: Field,
  value: UpdateProjectFields[Field] | null | undefined
): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    changes.fieldsToRemove.push(field);
    return;
  }
  changes.fieldsToSet[field] = value;
}

/** "" or spaces -> null (remove it), otherwise the trimmed text */
function toTextOrNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = value.trim();
  if (text === "") {
    return null;
  }
  return text;
}

/** "YYYY-MM-DD" -> Date, null stays null (remove it) */
function toDateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return new Date(value);
}

/** "#7c6cf2" -> "#7C6CF2", null stays null (remove it) */
function toColorOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return value.toUpperCase();
}

/** The end date must not be before the start date, using the new value or, if not sent, the saved one */
function checkDateOrder(input: UpdateProjectInput, savedProject: IProject): void {
  const startDate = getFinalDate(input.startDate, savedProject.startDate);
  const targetDate = getFinalDate(input.targetDate, savedProject.targetDate);

  if (startDate && targetDate && targetDate < startDate) {
    throw new BadRequestError("End date cannot be before the start date");
  }
}

/** The date after the update: not sent -> the saved date, null -> no date, "YYYY-MM-DD" -> that date */
function getFinalDate(newValue: string | null | undefined, savedValue: Date | undefined): Date | undefined {
  if (newValue === undefined) {
    return savedValue;
  }
  if (newValue === null) {
    return undefined;
  }
  return new Date(newValue);
}
