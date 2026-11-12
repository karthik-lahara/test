import { Types } from "mongoose";
import { WorkItemModel } from "../models/work-item.model";
import { CreateWorkItemData, IWorkItem, WorkItemParent } from "../entities/work-item.entity";

/** All database access of the work item module */
export class WorkItemRepository {
  public async createWorkItem(data: CreateWorkItemData): Promise<IWorkItem> {
    const workItem = await WorkItemModel.create(data);
    return workItem.toObject();
  }

  /** The fields needed to check a parent, or null if it does not exist or is archived */
  public async findParent(id: Types.ObjectId): Promise<WorkItemParent | null> {
    return WorkItemModel.findOne({ _id: id, isArchived: false })
      .select({ _id: 1, projectId: 1, type: 1, key: 1, sprintId: 1 })
      .lean<WorkItemParent>();
  }
}
