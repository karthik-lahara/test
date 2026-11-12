import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { BadRequestError, ConflictError, NotFoundError } from "@utils/errors";
import { ProjectAccessService } from "@modules/project/services/project-access.service";
import { IProject } from "@modules/project/entities/project.entity";
import {
  createStatusSchema,
  deleteStatusQuerySchema,
  reorderStatusesSchema,
  statusParamsSchema,
  updateStatusSchema,
} from "../ajv-schema/work-item-status.schema";
import {
  CreateStatusInput,
  DEFAULT_STATUSES,
  DeleteStatusQuery,
  IWorkItemStatus,
  MAX_STATUSES_PER_PROJECT,
  ReorderStatusesInput,
  StatusCategory,
  StatusParams,
  StatusResponse,
  StatusSummary,
  STATUS_ORDER_STEP,
  UpdateStatusFields,
  UpdateStatusInput,
} from "../entities/work-item-status.entity";
import { WorkItemStatusRepository } from "../repositories/work-item-status.repository";

const DEFAULT_COLOR = "#8A8F98";

export const toStatusSummary = (s: IWorkItemStatus): StatusSummary => ({
  id: s._id.toString(),
  name: s.name,
  category: s.category,
  color: s.color,
});

const toStatusResponse = (s: IWorkItemStatus, itemCount: number): StatusResponse => ({
  ...toStatusSummary(s),
  projectId: s.projectId.toString(),
  order: s.order,
  isDefault: s.isDefault,
  itemCount,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const isDuplicateKeyError = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

/** A project always needs somewhere to start (todo) and somewhere to finish (done) */
const assertCategoriesCovered = (categories: StatusCategory[]): void => {
  if (!categories.includes("todo")) {
    throw new BadRequestError("A project needs at least one status in the To do category");
  }
  if (!categories.includes("done")) {
    throw new BadRequestError("A project needs at least one status in the Done category");
  }
};

export class WorkItemStatusService {
  private repository = new WorkItemStatusRepository();
  private projectAccess = new ProjectAccessService();

  // ---- Used by other modules ----

  /**
   * A project's active statuses. Seeds the defaults the first time (new projects, and projects
   * made before statuses existed).
   */
  public async ensureDefaultStatuses(
    project: Pick<IProject, "_id" | "organizationId">,
    userId: string
  ): Promise<IWorkItemStatus[]> {
    const statuses = await this.repository.listActive(project._id);
    if (statuses.length > 0) return statuses;

    await this.repository.createStatuses(
      DEFAULT_STATUSES.map((s, index) => ({
        organizationId: project.organizationId,
        projectId: project._id,
        name: s.name,
        nameKey: s.name.toLowerCase(),
        category: s.category,
        color: s.color,
        order: (index + 1) * STATUS_ORDER_STEP,
        isDefault: index === 0,
        createdBy: new Types.ObjectId(userId),
      }))
    );
    return this.repository.listActive(project._id);
  }

  /**
   * The status a new work item starts in: the one asked for (must be an active status of the
   * project), or the project's default.
   */
  public async resolveForNewItem(
    project: Pick<IProject, "_id" | "organizationId">,
    userId: string,
    statusId?: string | null
  ): Promise<IWorkItemStatus> {
    const statuses = await this.ensureDefaultStatuses(project, userId);
    if (statusId) {
      const status = statuses.find((s) => s._id.toString() === statusId);
      if (!status) throw new BadRequestError("The status must be one of this project's statuses");
      return status;
    }
    return statuses.find((s) => s.isDefault) ?? statuses[0];
  }

  // ---- Endpoints ----

  /** GET /:projectId — the project's statuses in board order, with item counts */
  public async listStatuses(projectId: string, userId: string): Promise<StatusResponse[]> {
    const access = await this.projectAccess.getProjectAccess(projectId, userId);
    this.projectAccess.assertProjectPermission(access, "work_item_status:view");

    const statuses = await this.ensureDefaultStatuses(access.project, userId);
    const counts = await this.repository.countItemsByStatus(access.project._id);
    return statuses.map((s) => toStatusResponse(s, counts.get(s._id.toString()) ?? 0));
  }

  /** POST /:projectId — adds a status at the end of the board */
  public async createStatus(projectId: string, userId: string, body: unknown): Promise<StatusResponse> {
    const access = await this.projectAccess.getProjectAccess(projectId, userId);
    this.projectAccess.assertProjectPermission(access, "work_item_status:manage");
    const input = validateWithSchema<CreateStatusInput>(createStatusSchema, body);

    const existing = await this.ensureDefaultStatuses(access.project, userId);
    if (existing.length >= MAX_STATUSES_PER_PROJECT) {
      throw new BadRequestError(`A project can have at most ${MAX_STATUSES_PER_PROJECT} statuses`);
    }
    if (input.isDefault && input.category === "done") {
      throw new BadRequestError("The default status cannot be in the Done category");
    }

    const name = input.name.trim();
    let status: IWorkItemStatus;
    try {
      status = await this.repository.createStatus({
        organizationId: access.project.organizationId,
        projectId: access.project._id,
        name,
        nameKey: name.toLowerCase(),
        category: input.category,
        color: input.color?.toUpperCase() ?? DEFAULT_COLOR,
        order: (await this.repository.maxOrder(access.project._id)) + STATUS_ORDER_STEP,
        isDefault: input.isDefault ?? false,
        createdBy: new Types.ObjectId(userId),
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new ConflictError(`A status called "${name}" already exists`);
      throw err;
    }

    if (status.isDefault) await this.repository.clearDefault(access.project._id, status._id);
    return toStatusResponse(status, 0);
  }

  /** PATCH /update/:statusId — rename, recolour, change category, or make it the default */
  public async updateStatus(statusId: string, userId: string, body: unknown): Promise<StatusResponse> {
    const { status, statuses } = await this.loadForManage(statusId, userId);
    const input = validateWithSchema<UpdateStatusInput>(updateStatusSchema, body);

    const category = input.category ?? status.category;
    if (input.category && input.category !== status.category) {
      // The project must still have a todo and a done status after the change
      assertCategoriesCovered(statuses.map((s) => (s._id.equals(status._id) ? category : s.category)));
    }
    if ((input.isDefault || status.isDefault) && category === "done") {
      throw new BadRequestError("The default status cannot be in the Done category");
    }

    const fields: UpdateStatusFields = {};
    if (input.name !== undefined) {
      fields.name = input.name.trim();
      fields.nameKey = fields.name.toLowerCase();
    }
    if (input.category !== undefined) fields.category = input.category;
    if (input.color !== undefined) fields.color = input.color.toUpperCase();
    if (input.isDefault) fields.isDefault = true;

    let updated: IWorkItemStatus | null;
    try {
      updated = await this.repository.updateStatus(status._id, fields);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new ConflictError(`A status called "${fields.name}" already exists`);
      throw err;
    }
    if (!updated) throw new NotFoundError("Status not found");

    if (input.isDefault) await this.repository.clearDefault(status.projectId, status._id);
    if (updated.category !== status.category) {
      await this.repository.changeItemsCategory(status._id, status.category, updated.category);
    }
    return toStatusResponse(updated, await this.repository.countItems(status._id));
  }

  /** POST /reorder/:projectId — new board order; must list every active status once */
  public async reorderStatuses(projectId: string, userId: string, body: unknown): Promise<StatusResponse[]> {
    const access = await this.projectAccess.getProjectAccess(projectId, userId);
    this.projectAccess.assertProjectPermission(access, "work_item_status:manage");
    const input = validateWithSchema<ReorderStatusesInput>(reorderStatusesSchema, body);

    const statuses = await this.ensureDefaultStatuses(access.project, userId);
    const known = new Set(statuses.map((s) => s._id.toString()));
    const complete = input.statusIds.length === known.size && input.statusIds.every((id) => known.has(id));
    if (!complete) {
      throw new BadRequestError("statusIds must list every status of the project exactly once");
    }

    await this.repository.setOrders(
      input.statusIds.map((id, index) => ({ id: new Types.ObjectId(id), order: (index + 1) * STATUS_ORDER_STEP }))
    );
    return this.listStatuses(projectId, userId);
  }

  /**
   * DELETE /delete/:statusId?moveToStatusId=... — removes a status. Its work items move to
   * moveToStatusId first (required when it has items). The default status cannot be deleted.
   */
  public async deleteStatus(statusId: string, userId: string, rawQuery: unknown): Promise<void> {
    const { status, statuses } = await this.loadForManage(statusId, userId);
    const query = validateWithSchema<DeleteStatusQuery>(deleteStatusQuerySchema, { ...(rawQuery as object) });

    if (status.isDefault) {
      throw new BadRequestError("This is the default status. Make another status the default first.");
    }
    const remaining = statuses.filter((s) => !s._id.equals(status._id));
    assertCategoriesCovered(remaining.map((s) => s.category));

    const itemCount = await this.repository.countItems(status._id);
    if (itemCount > 0) {
      if (!query.moveToStatusId) {
        throw new BadRequestError(
          `${itemCount} work item(s) are in "${status.name}". Choose a status to move them to (moveToStatusId).`
        );
      }
      const target = remaining.find((s) => s._id.toString() === query.moveToStatusId);
      if (!target) {
        throw new BadRequestError("moveToStatusId must be another status of the same project");
      }
      await this.repository.moveItems(status, target);
    }

    await this.repository.archiveStatus(status._id);
  }

  /** Loads a status and its project's statuses after checking "work_item_status:manage" */
  private async loadForManage(
    statusId: string,
    userId: string
  ): Promise<{ status: IWorkItemStatus; statuses: IWorkItemStatus[] }> {
    validateWithSchema<StatusParams>(statusParamsSchema, { statusId });
    const status = await this.repository.findActiveById(new Types.ObjectId(statusId));
    if (!status) throw new NotFoundError("Status not found");

    // 404 for outsiders, 403 for members without the permission
    const access = await this.projectAccess.getProjectAccess(status.projectId.toString(), userId);
    this.projectAccess.assertProjectPermission(access, "work_item_status:manage");

    const statuses = await this.repository.listActive(status.projectId);
    return { status, statuses };
  }
}
