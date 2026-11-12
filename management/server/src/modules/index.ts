import { Router } from "express";
import { AuthRouter } from "./auth/routes/auth.route";
import { OrganizationRouter } from "./organization/routes/organization.route";
import { ProjectRouter } from "./project/routes/project.route";
import { WorkItemRouter } from "./work-item/routes/work-item.route";
import { WorkItemStatusRouter } from "./work-item-status/routes/work-item-status.route";

export class AppRoutes {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use("/auth", new AuthRouter().router);
    this.router.use("/organization", new OrganizationRouter().router);
    this.router.use("/projects", new ProjectRouter().router);
    this.router.use("/work-items", new WorkItemRouter().router);
    this.router.use("/work-item-statuses", new WorkItemStatusRouter().router);
  }
}

export default new AppRoutes().router;
