import { Types } from "mongoose";
import { WorkItemModel } from "@modules/work-item/models/work-item.model";
import { WorkItemStatusModel } from "../models/work-item-status.model";
import {
  CreateStatusData,
  IWorkItemStatus,
  StatusCategory,
  UpdateStatusFields,
} from "../entities/work-item-status.entity";

/**
 * What changes on a work item when its status category changes:
 * entering "done" stamps completedAt, leaving "done" clears it.
 */
const categoryChange = (from: StatusCategory, to: StatusCategory) => {
  const update: { $set: Record<string, unknown>; $unset?: Record<string, 1> } = { $set: { statusCategory: to } };
  if (to === "done" && from !== "done") update.$set.completedAt = new Date();
  if (from === "done" && to !== "done") update.$unset = { completedAt: 1 };
  return update;
};

/** All database access of the work item status module */
export class WorkItemStatusRepository {
  // ---- Statuses ----

  /** A project's active statuses in board order */
  public async listActive(projectId: Types.ObjectId): Promise<IWorkItemStatus[]> {
    return WorkItemStatusModel.find({ projectId, isArchived: false }).sort({ order: 1 }).lean<IWorkItemStatus[]>();
  }

  public async findActiveById(id: Types.ObjectId): Promise<IWorkItemStatus | null> {
    return WorkItemStatusModel.findOne({ _id: id, isArchived: false }).lean<IWorkItemStatus>();
  }

  public async createStatus(data: CreateStatusData): Promise<IWorkItemStatus> {
    const status = await WorkItemStatusModel.create(data);
    return status.toObject();
  }

  /**
   * Inserts several statuses. Duplicates (another request seeded the same project at the same
   * moment) are skipped instead of failing the whole call.
   */
  public async createStatuses(data: CreateStatusData[]): Promise<void> {
    try {
      await WorkItemStatusModel.insertMany(data, { ordered: false });
    } catch (err) {
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
  }

  public async updateStatus(id: Types.ObjectId, fields: UpdateStatusFields): Promise<IWorkItemStatus | null> {
    return WorkItemStatusModel.findOneAndUpdate(
      { _id: id, isArchived: false },
      { $set: fields },
      { returnDocument: "after", runValidators: true }
    ).lean<IWorkItemStatus>();
  }

  /** Makes every other status of the project non-default */
  public async clearDefault(projectId: Types.ObjectId, exceptId: Types.ObjectId): Promise<void> {
    await WorkItemStatusModel.updateMany(
      { projectId, isArchived: false, isDefault: true, _id: { $ne: exceptId } },
      { $set: { isDefault: false } }
    );
  }

  /** Saves a new board order in one round trip */
  public async setOrders(rows: Array<{ id: Types.ObjectId; order: number }>): Promise<void> {
    await WorkItemStatusModel.bulkWrite(
      rows.map((row) => ({ updateOne: { filter: { _id: row.id }, update: { $set: { order: row.order } } } }))
    );
  }

  /** Soft delete; also frees the name for a new status */
  public async archiveStatus(id: Types.ObjectId): Promise<void> {
    await WorkItemStatusModel.updateOne({ _id: id }, { $set: { isArchived: true, isDefault: false } });
  }

  /** The highest `order` among the project's active statuses (0 when none) */
  public async maxOrder(projectId: Types.ObjectId): Promise<number> {
    const last = await WorkItemStatusModel.findOne({ projectId, isArchived: false })
      .sort({ order: -1 })
      .select({ order: 1 })
      .lean<Pick<IWorkItemStatus, "order">>();
    return last?.order ?? 0;
  }

  // ---- Work items in a status ----

  /** Active work items per status of a project */
  public async countItemsByStatus(projectId: Types.ObjectId): Promise<Map<string, number>> {
    const rows = await WorkItemModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { projectId, isArchived: false } },
      { $group: { _id: "$statusId", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  public async countItems(statusId: Types.ObjectId): Promise<number> {
    return WorkItemModel.countDocuments({ statusId, isArchived: false });
  }

  /** Moves every work item from one status to another (before the first is deleted) */
  public async moveItems(from: IWorkItemStatus, to: IWorkItemStatus): Promise<void> {
    const update = categoryChange(from.category, to.category);
    update.$set.statusId = to._id;
    await WorkItemModel.updateMany({ statusId: from._id }, update);
  }

  /** Keeps the items' copy of the category in step when a status changes category */
  public async changeItemsCategory(statusId: Types.ObjectId, from: StatusCategory, to: StatusCategory): Promise<void> {
    await WorkItemModel.updateMany({ statusId }, categoryChange(from, to));
  }
}
