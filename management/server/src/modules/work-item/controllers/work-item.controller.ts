import { AuthRequest } from "@middleware/auth.middleware";
import { CustomResponse } from "@middleware/response.middleware";
import { STATUS_CODE } from "@utils/status-code";
import { WorkItemService } from "../services/work-item.service";

export class WorkItemController {
  private service = new WorkItemService();

  /** organizationId and projectId come in the body */
  public create = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.createWorkItem(req.user!.userId, req.body);
    res.success("Work item created successfully", data, STATUS_CODE.CREATED);
  };
}
