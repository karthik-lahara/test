import { AuthRequest } from "@middleware/auth.middleware";
import { CustomResponse } from "@middleware/response.middleware";
import { STATUS_CODE } from "@utils/status-code";
import { OrganizationService } from "../services/organization.service";

export class OrganizationController {
  private service = new OrganizationService();

  public create = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.createOrganization(req.user!.userId, req.body);
    res.success("Organization created successfully", data, STATUS_CODE.CREATED);
  };

  
  public list = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.getMyOrganizations(req.user!.userId);
    res.success("Organizations fetched successfully", data, STATUS_CODE.OK);
  };

  public update = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.updateOrganization(String(req.params.organizationId), req.user!.userId, req.body);
    res.success("Organization updated successfully", data, STATUS_CODE.OK);
  };

  public remove = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    await this.service.deleteOrganization(String(req.params.organizationId), req.user!.userId);
    res.success("Organization deleted successfully", null, STATUS_CODE.OK);
  };

  public listMembers = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const organizationId = String(req.params.organizationId);
    const userId = req.user!.userId;

    const data = await this.service.listMembers(organizationId, userId, req.query);
    res.success("Organization members fetched successfully", data, STATUS_CODE.OK);
  };
}
