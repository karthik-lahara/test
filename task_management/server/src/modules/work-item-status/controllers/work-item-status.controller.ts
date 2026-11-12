import { AuthRequest } from "@middleware/auth.middleware";
import { CustomResponse } from "@middleware/response.middleware";
import { STATUS_CODE } from "@utils/status-code";
import { WorkItemStatusService } from "../services/work-item-status.service";

export class WorkItemStatusController {
  private service = new WorkItemStatusService();

  public list = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.listStatuses(String(req.params.projectId), req.user!.userId);
    res.success("Statuses fetched successfully", data, STATUS_CODE.OK);
  };

  public create = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.createStatus(String(req.params.projectId), req.user!.userId, req.body);
    res.success("Status created successfully", data, STATUS_CODE.CREATED);
  };

  public update = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.updateStatus(String(req.params.statusId), req.user!.userId, req.body);
    res.success("Status updated successfully", data, STATUS_CODE.OK);
  };

  public reorder = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.reorderStatuses(String(req.params.projectId), req.user!.userId, req.body);
    res.success("Statuses reordered successfully", data, STATUS_CODE.OK);
  };

  public remove = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    await this.service.deleteStatus(String(req.params.statusId), req.user!.userId, req.query);
    res.success("Status deleted successfully", null, STATUS_CODE.OK);
  };
}
