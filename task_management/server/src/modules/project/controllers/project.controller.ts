import { AuthRequest } from "@middleware/auth.middleware";
import { CustomResponse } from "@middleware/response.middleware";
import { STATUS_CODE } from "@utils/status-code";
import { ProjectService } from "../services/project.service";

export class ProjectController {
  private service = new ProjectService();

  public create = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.createProject(String(req.params.organizationId), req.user!.userId, req.body);
    res.success("Project created successfully", data, STATUS_CODE.CREATED);
  };

  public list = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.listProjects(String(req.params.organizationId), req.user!.userId, req.query);
    res.success("Projects fetched successfully", data, STATUS_CODE.OK);
  };

  public getOne = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const data = await this.service.getProject(String(req.params.projectId), req.user!.userId);
    res.success("Project fetched successfully", data, STATUS_CODE.OK);
  };

  public update = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const projectId = String(req.params.projectId);
    const userId = req.user!.userId;

    const data = await this.service.updateProject(projectId, userId, req.body);
    res.success("Project updated successfully", data, STATUS_CODE.OK);
  };

  public remove = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const projectId = String(req.params.projectId);
    const userId = req.user!.userId;

    await this.service.deleteProject(projectId, userId);
    res.success("Project deleted successfully", null, STATUS_CODE.OK);
  };

  public listMembers = async (req: AuthRequest, res: CustomResponse): Promise<void> => {
    const projectId = String(req.params.projectId);
    const userId = req.user!.userId;

    const data = await this.service.listProjectMembers(projectId, userId, req.query);
    res.success("Project members fetched successfully", data, STATUS_CODE.OK);
  };
}
