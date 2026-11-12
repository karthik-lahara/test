import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { BadRequestError, NotFoundError } from "@utils/errors";
import { OrganizationAccessService } from "@modules/organization/services/organization-access.service";
import { ProjectAccessService } from "@modules/project/services/project-access.service";
import { ProjectRepository } from "@modules/project/repositories/project.repository";
import { IWorkItemStatus } from "@modules/work-item-status/entities/work-item-status.entity";
import { toStatusSummary, WorkItemStatusService } from "@modules/work-item-status/services/work-item-status.service";
import { createWorkItemSchema } from "../ajv-schema/create-work-item.schema";
import {
  CreateWorkItemInput,
  IWorkItem,
  NOT_IN_SPRINT_TYPES,
  ORDER_STEP,
  PARENT_TYPES,
  SPRINT_FOLLOWING_PARENT_TYPES,
  STORY_POINT_TYPES,
  TYPE_LABELS,
  WorkItemParent,
  WorkItemResponse,
  WorkItemType,
} from "../entities/work-item.entity";
import { WorkItemRepository } from "../repositories/work-item.repository";

const toWorkItemResponse = (w: IWorkItem, status: IWorkItemStatus): WorkItemResponse => ({
  id: w._id.toString(),
  organizationId: w.organizationId.toString(),
  projectId: w.projectId.toString(),
  key: w.key,
  type: w.type,
  title: w.title,
  description: w.description ?? "",
  acceptanceCriteria: w.acceptanceCriteria.map((c) => ({ id: c._id.toString(), text: c.text, done: c.done })),
  statusId: w.statusId.toString(),
  status: toStatusSummary(status),
  priority: w.priority,
  assigneeIds: w.assigneeIds.map((id) => id.toString()),
  reporterId: w.reporterId.toString(),
  parentId: w.parentId?.toString() ?? null,
  sprintId: w.sprintId?.toString() ?? null,
  labels: w.labels,
  startDate: w.startDate ?? null,
  dueDate: w.dueDate ?? null,
  estimateHours: w.estimateHours ?? null,
  loggedHours: w.loggedHours,
  storyPoints: w.storyPoints ?? null,
  createdVia: w.createdVia,
  aiGenerated: w.aiGenerated,
  attachments: w.attachments.map((a) => ({ id: a._id.toString(), fileName: a.fileName, fileUrl: a.fileUrl })),
  order: w.order,
  completedAt: w.completedAt ?? null,
  createdBy: w.createdBy.toString(),
  isArchived: w.isArchived,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

const clean = (value?: string): string | undefined => value?.trim() || undefined;

/** "a story" / "an epic" */
const withArticle = (type: WorkItemType): string => {
  const label = TYPE_LABELS[type];
  return /^[aeiou]/.test(label) ? `an ${label}` : `a ${label}`;
};

export class WorkItemService {
  private repository = new WorkItemRepository();
  private projectRepository = new ProjectRepository();
  private projectAccess = new ProjectAccessService();
  private organizationAccess = new OrganizationAccessService();
  private statusService = new WorkItemStatusService();

  /**
   * Creates a work item in a project. Allowed for organization admins and the project's
   * managers and members ("work_item:create").
   * @param userId from the access token; becomes the reporter
   * @param body organizationId and projectId are required; the project must belong to that
   *   organization
   */
  public async createWorkItem(userId: string, body: unknown): Promise<WorkItemResponse> {
    // The body says where the item goes, so it is checked first
    const input = validateWithSchema<CreateWorkItemInput>(createWorkItemSchema, body);

    const access = await this.projectAccess.getProjectAccess(input.projectId, userId);
    const { project } = access;
    // Same answer as a missing project, so the ids can't be used to probe other organizations
    if (project.organizationId.toString() !== input.organizationId) {
      throw new NotFoundError("Project not found in this organization");
    }
    this.projectAccess.assertProjectPermission(access, "work_item:create");

    // Hierarchy: Epic → Feature → Story → Task / Bug → Subtask, all in the same project
    const parent = await this.checkParent(input.type, input.parentId, project._id);
    const sprintId = this.pickSprint(input.type, input.sprintId, parent);

    // Story points only where the team estimates in points
    if (input.storyPoints != null && !STORY_POINT_TYPES.includes(input.type)) {
      throw new BadRequestError("Story points are only for stories and bugs. Use estimateHours instead.");
    }

    const startDate = input.startDate ? new Date(input.startDate) : undefined;
    const dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
    if (startDate && dueDate && dueDate < startDate) {
      throw new BadRequestError("Due date cannot be before the start date");
    }

    // Only colleagues can be assigned
    const assigneeIds = (input.assigneeIds ?? []).map((id) => new Types.ObjectId(id));
    await this.organizationAccess.assertAllActiveMembers(
      project.organizationId,
      assigneeIds,
      "Assignees must be active members of this organization"
    );

    const labels = [...new Set((input.labels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean))];
    const acceptanceCriteria = (input.acceptanceCriteria ?? [])
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ text, done: false }));

    // The status asked for, or the project's default (seeds the defaults on first use)
    const status = await this.statusService.resolveForNewItem(project, userId, input.statusId);

    // Last step before saving, so a rejected request does not use up a number
    const number = await this.projectRepository.nextWorkItemNumber(project._id);
    if (number === null) {
      throw new NotFoundError("Project not found");
    }

    const creatorId = new Types.ObjectId(userId);
    const workItem = await this.repository.createWorkItem({
      organizationId: project.organizationId,
      projectId: project._id,
      number,
      key: `${project.key}-${number}`,
      type: input.type,
      title: input.title.trim(),
      description: clean(input.description),
      acceptanceCriteria,
      statusId: status._id,
      statusCategory: status.category,
      priority: input.priority ?? "medium",
      assigneeIds,
      reporterId: creatorId,
      parentId: parent?._id,
      sprintId,
      labels,
      startDate,
      dueDate,
      estimateHours: input.estimateHours ?? undefined,
      storyPoints: input.storyPoints ?? undefined,
      createdVia: input.createdVia ?? "manual",
      aiGenerated: input.aiGenerated ?? false,
      // Numbers only go up, so new items land at the end of the backlog. The gap of
      // ORDER_STEP leaves room to drop an item between two others when reordering.
      order: number * ORDER_STEP,
      completedAt: status.category === "done" ? new Date() : undefined,
      createdBy: creatorId,
    });

    return toWorkItemResponse(workItem, status);
  }

  /**
   * The sprint the new item goes in. Epics and features are never in one; an item under a
   * story, bug or task follows its parent's sprint, whatever was sent.
   * The sprint itself is not checked yet: there is no sprints module.
   */
  private pickSprint(
    type: WorkItemType,
    rawSprintId: string | null | undefined,
    parent: WorkItemParent | undefined
  ): Types.ObjectId | undefined {
    if (NOT_IN_SPRINT_TYPES.includes(type)) {
      if (rawSprintId) {
        throw new BadRequestError("Epics and features span sprints. Plan their stories instead.");
      }
      return undefined;
    }
    if (parent && SPRINT_FOLLOWING_PARENT_TYPES.includes(parent.type)) {
      return parent.sprintId;
    }
    return rawSprintId ? new Types.ObjectId(rawSprintId) : undefined;
  }

  /**
   * Checks the parent fits the hierarchy, is in the same project and is not archived.
   * Returns it, or undefined for a top-level item.
   */
  private async checkParent(
    type: WorkItemType,
    rawParentId: string | null | undefined,
    projectId: Types.ObjectId
  ): Promise<WorkItemParent | undefined> {
    const allowed = PARENT_TYPES[type];

    if (!rawParentId) {
      if (type === "subtask") {
        throw new BadRequestError("A subtask needs a parent task or bug");
      }
      return undefined;
    }

    if (allowed.length === 0) {
      throw new BadRequestError("An epic is top level and cannot have a parent");
    }

    const parent = await this.repository.findParent(new Types.ObjectId(rawParentId));
    if (!parent || !parent.projectId.equals(projectId)) {
      throw new BadRequestError("The parent must be a work item in the same project");
    }
    if (!allowed.includes(parent.type)) {
      // e.g. "A subtask goes under a task or a bug, not a story (PAY-3)"
      const child = withArticle(type);
      const allowedNames = allowed.map(withArticle).join(" or ");
      throw new BadRequestError(
        `${child.charAt(0).toUpperCase()}${child.slice(1)} goes under ${allowedNames}, not ${withArticle(parent.type)} (${parent.key})`
      );
    }
    return parent;
  }
}
